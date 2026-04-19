#!/bin/bash
# One-time AWS bootstrap for kemist-dashboard. Creates the
# read-only `kemist-dashboard-reader` IAM role that the dashboard
# repo's GitHub Actions workflow assumes via OIDC to pull scan data
# from the orchestrator's S3 bucket.
#
# Idempotent — safe to re-run. Updates the trust policy in place if
# the repository or default branch changes.
#
# Prereqs:
#   - AWS CLI v2 configured with creds in the orchestrator's account
#     (596775734635). The kemist-orchestrator's bootstrap.sh has
#     already created the GitHub OIDC provider we reuse here.
#
# Usage:
#   ./scripts/bootstrap-dashboard.sh                              # defaults
#   ./scripts/bootstrap-dashboard.sh regenscheid/kemist-dashboard # explicit repo
#
# Environment:
#   AWS_REGION        (default: us-east-1)
#   DATA_BUCKET       (default: kemist-fleet-data-<acct>-<region>)
#   GITHUB_REPOSITORY (default: regenscheid/kemist-dashboard)
#   DEFAULT_BRANCH    (default: main)

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
GITHUB_REPOSITORY="${1:-${GITHUB_REPOSITORY:-regenscheid/kemist-dashboard}}"
ROLE_NAME="kemist-dashboard-reader"
OIDC_PROVIDER_URL="token.actions.githubusercontent.com"
OIDC_AUDIENCE="sts.amazonaws.com"

step() { printf '\n==> %s\n' "$*"; }
skip() { printf '    (skip) %s\n' "$*"; }

# ---------------------------------------------------------------------
step "Checking caller identity"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
DATA_BUCKET="${DATA_BUCKET:-kemist-fleet-data-${ACCOUNT_ID}-${AWS_REGION}}"
echo "    account: ${ACCOUNT_ID}"
echo "    region:  ${AWS_REGION}"
echo "    bucket:  ${DATA_BUCKET}"
echo "    repo:    ${GITHUB_REPOSITORY}"
echo "    branch:  ${DEFAULT_BRANCH}"

OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER_URL}"
if ! aws iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "${OIDC_ARN}" >/dev/null 2>&1; then
    echo "ERROR: GitHub OIDC provider not found at ${OIDC_ARN}." >&2
    echo "Run kemist-orchestrator/scripts/bootstrap.sh first — it" >&2
    echo "creates the OIDC provider we reuse here." >&2
    exit 1
fi
echo "    OIDC provider present."

# ---------------------------------------------------------------------
step "Building trust + permissions policies"
# Trust policy: assumable only by this specific repo's main branch
# OR when it's running against the `github-pages` environment
# (which is what actions/deploy-pages@v4 sets up). Two sub-claim
# forms are allowed because GitHub Actions rewrites the OIDC sub
# to include the environment name when an `environment:` block is
# present, bypassing the branch-based sub. Both forms are still
# scoped to this repo, so blast radius doesn't change.
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${OIDC_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_PROVIDER_URL}:aud": "${OIDC_AUDIENCE}"
        },
        "StringLike": {
          "${OIDC_PROVIDER_URL}:sub": [
            "repo:${GITHUB_REPOSITORY}:ref:refs/heads/${DEFAULT_BRANCH}",
            "repo:${GITHUB_REPOSITORY}:environment:github-pages"
          ]
        }
      }
    }
  ]
}
EOF
)

# Permissions: read-only on raw/*, nothing else. Explicitly does not
# grant access to targets/* (including opt-out.txt) or write
# anywhere. No KMS.
ALERTS_TOPIC_ARN="arn:aws:sns:${AWS_REGION}:${ACCOUNT_ID}:kemist-fleet-alerts"
PERMISSIONS_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadScanResults",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${DATA_BUCKET}/raw/*"
    },
    {
      "Sid": "ListScanPartitions",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${DATA_BUCKET}",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["raw/", "raw/*"]
        }
      }
    },
    {
      "Sid": "PublishBuildFailures",
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "${ALERTS_TOPIC_ARN}"
    }
  ]
}
EOF
)

# ---------------------------------------------------------------------
step "Ensuring role ${ROLE_NAME} exists"
if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
    echo "    updating trust policy"
    aws iam update-assume-role-policy \
        --role-name "${ROLE_NAME}" \
        --policy-document "${TRUST_POLICY}"
else
    aws iam create-role \
        --role-name "${ROLE_NAME}" \
        --assume-role-policy-document "${TRUST_POLICY}" \
        --description "OIDC-assumed role for kemist-dashboard GitHub Actions deploy workflow. Read-only on raw/* in the orchestrator's data bucket." \
        --tags Key=Project,Value=kemist-fleet Key=ManagedBy,Value=bootstrap-dashboard \
        >/dev/null
    echo "    created role"
fi

aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "ReadRawScanResults" \
    --policy-document "${PERMISSIONS_POLICY}"
echo "    attached inline permissions policy"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# ---------------------------------------------------------------------
cat <<EOF

Bootstrap complete.

  Dashboard reader role ARN:
    ${ROLE_ARN}

Set this as a repository secret in
  https://github.com/${GITHUB_REPOSITORY}/settings/secrets/actions
Name: AWS_DEPLOY_ROLE_ARN
Value: ${ROLE_ARN}

Verify it works:
  aws sts assume-role-with-web-identity ...    # normally done by GitHub Actions
  pnpm fetch:s3 --bucket ${DATA_BUCKET}        # manual test after deploy

The role has no write, no KMS, no access to targets/* — only
read-only access to the scan corpus under raw/*.
EOF

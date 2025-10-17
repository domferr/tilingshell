#!/usr/bin/env bash

set -e  # exit on error

# Usage info
usage() {
    echo "Usage:"
    echo "  $0 fetch <PR_NUMBER> <PR_BRANCH_NAME>"
    echo "  $0 push <PR_USERNAME> <PR_BRANCH_NAME> [--force]"
    echo
    echo "Examples:"
    echo "  $0 fetch 345 feat-about-something"
    echo "  $0 push domferr feat-about-something"
    echo "  $0 push domferr feat-about-something --force"
    exit 1
}

# Ensure at least one argument is provided
if [ $# -lt 1 ]; then
    usage
fi

ACTION=$1
shift

case "$ACTION" in
    fetch)
        if [ $# -ne 2 ]; then
            usage
        fi
        PR_NUMBER=$1
        PR_BRANCH_NAME=$2

        echo "Fetching PR #$PR_NUMBER into local branch '$PR_BRANCH_NAME'..."
        set -x
        git fetch origin pull/"$PR_NUMBER"/head:"$PR_BRANCH_NAME"
        set +x
        echo "✅ Done. You can now checkout the branch with:"
        echo "   git checkout $PR_BRANCH_NAME"
        ;;

    push)
        if [ $# -lt 2 ] || [ $# -gt 3 ]; then
            usage
        fi
        PR_USERNAME=$1
        PR_BRANCH_NAME=$2
        FORCE_FLAG=""

        if [ "${3:-}" = "--force" ]; then
            FORCE_FLAG="--force"
            echo "⚠️  Force push enabled."
        fi

        echo "Pushing branch '$PR_BRANCH_NAME' to $PR_USERNAME/tilingshell.git as '$PR_BRANCH_NAME'..."
        set -x
        git push $FORCE_FLAG git@github.com:"$PR_USERNAME"/tilingshell.git "$PR_BRANCH_NAME":"$PR_BRANCH_NAME"
        set +x
        echo "✅ Done."
        ;;

    *)
        usage
        ;;
esac


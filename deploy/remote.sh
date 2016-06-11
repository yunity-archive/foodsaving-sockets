#!/bin/bash

set -e

BRANCH=$1

if [ "x$BRANCH" = "x" ]; then
  echo "Please pass branch to deploy as first argument"
  exit 1
fi

if [ ! -d yunity-sockets ]; then
  git clone https://github.com/yunity/yunity-sockets.git
fi

(
  cd yunity-sockets && \
  npm prune --production && \
  npm install --production
)

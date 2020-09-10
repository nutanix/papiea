#!/usr/bin/env bash
set -e

# Optionally try install pip if it doesn't exist
if ! python3 -m pip --version ; then
  if ! sudo apt-get install python3-pip ; then
    echo "Couldn't install pip via apt-get, exiting"
    exit 1
  fi
fi

# This scripts builds and pushes python distributable
# to nutanix remote pypi repo
python3 -m pip install --user --upgrade setuptools wheel

# Version is passed here as a hack
# since there isn't an easy way to
# add params to setup.py
VERSION="1.0.2020" python3 setup.py sdist bdist_wheel

python3 -m pip install --user --upgrade twine

export TWINE_USERNAME="__token__"
export TWINE_PASSWORD="$TEST_PYPI_KEY"

python3 -m twine upload --repository testpypi dist/*

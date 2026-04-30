#!/usr/bin/env bash
# Render Build Script
set -o errexit

pip install -r requirements.txt
prisma generate
prisma db push

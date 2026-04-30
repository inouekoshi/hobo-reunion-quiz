#!/usr/bin/env bash
# Render Build Script
set -o errexit

pip install -r requirements.txt
prisma py fetch        # ← これを追加！実行バイナリを強制的にダウンロードします
prisma generate
prisma db push
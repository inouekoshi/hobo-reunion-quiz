#!/usr/bin/env bash
# Render Build Script
set -o errexit

# 1. 依存関係のインストール
pip install -r requirements.txt

# 2. バイナリをダウンロード
# 確実にダウンロードさせるため、一度デフォルトの場所に落とします
prisma py fetch

# 3. バイナリをカレントディレクトリ（backend/）に強制コピー
# ファイル名のパターンを広げ、パスを再帰的に検索してすべて現在の階層に集めます
echo "Searching for Prisma binaries..."
find /opt/render/.cache/prisma-python/binaries -name "*query-engine*" -exec cp {} . \;

# 4. コピーされたバイナリを確認し、実行権限を付与
# ファイルが存在するかチェックしてから chmod を実行します
if ls *query-engine* 1> /dev/null 2>&1; then
    echo "Prisma binaries found and copying... granting execution permissions."
    chmod +x *query-engine*
else
    echo "ERROR: Prisma binaries not found in cache. Listing cache content for debug:"
    ls -R /opt/render/.cache/prisma-python/
    exit 1
fi

# 5. クライアント生成
prisma generate

# 6. DB構造の反映
prisma db push
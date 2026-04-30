#!/usr/bin/env bash
set -o errexit

# 1. 依存関係のインストール
pip install -r requirements.txt

# 2. Prismaエンジンバイナリのマニュアルダウンロード
# ログから特定したハッシュ（5.11.0）と、RenderのOS（Debian OpenSSL 3.0.x）を直接指定
ENGINE_HASH="efd2449663b3d73d637ea1fd226bafbcf45b3102"
BINARY_NAME="prisma-query-engine-debian-openssl-3.0.x"

echo "Step: Downloading Prisma engine binary directly..."
curl -L "https://binaries.prisma.sh/all_commits/${ENGINE_HASH}/debian-openssl-3.0.x/query-engine.gz" -o query-engine.gz
gunzip -f query-engine.gz
mv -f query-engine "$BINARY_NAME"
chmod +x "$BINARY_NAME"

echo "Status: Prisma engine binary ($BINARY_NAME) is placed in backend root."

# 3. クライアント生成
# ここでバイナリが同ディレクトリにあることを検知させます
prisma generate

prisma db push --accept-data-loss
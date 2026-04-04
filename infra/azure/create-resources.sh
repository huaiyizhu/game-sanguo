#!/usr/bin/env bash
# 使用 Azure CLI 创建：资源组、Linux 应用服务计划、Web 应用（Node 20）
# 前置：已安装 az 并已 az login；订阅正确（az account show）
set -euo pipefail

LOCATION="${LOCATION:-eastasia}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-game-sanguo-prod}"
PLAN_NAME="${PLAN_NAME:-plan-game-sanguo-linux}"
# 全局唯一，请改成自己的前缀（小写字母与数字，2–60 字符）
APP_NAME="${APP_NAME:-game-sanguo-$(openssl rand -hex 4)}"
SKU="${SKU:-B1}"

echo "==> 资源组: $RESOURCE_GROUP | 区域: $LOCATION | 应用名: $APP_NAME | 计划 SKU: $SKU"

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

az appservice plan create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PLAN_NAME" \
  --is-linux \
  --sku "$SKU"

az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$PLAN_NAME" \
  --name "$APP_NAME" \
  --runtime "NODE:20-lts"

# 与 GitHub Actions 上传的 zip 布局一致：wwwroot 下为 server/ 与 client/
az webapp config set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --startup-file "node server/src/index.js"

az webapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --https-only true

if [[ "$SKU" != "F1" && "$SKU" != "FREE" ]]; then
  az webapp config set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --always-on true
fi

echo ""
echo "请输入生产环境 JWT_SECRET（留空则跳过，稍后在门户里配置）："
read -r JWT_SECRET || true
if [[ -n "${JWT_SECRET:-}" ]]; then
  az webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --settings NODE_ENV=production JWT_SECRET="$JWT_SECRET" \
    --output none
  echo "已写入 NODE_ENV、JWT_SECRET。"
else
  echo "未设置 JWT_SECRET。部署前务必在 Azure 门户 → 配置 → 应用程序设置 中添加 JWT_SECRET。"
fi

echo ""
echo "========== 下一步 =========="
echo "1) GitHub 仓库 → Settings → Secrets → Actions，新增："
echo "   AZURE_WEBAPP_NAME = $APP_NAME"
echo "2) 将下方发布配置文件完整 XML 粘贴到 Secret：AZURE_WEBAPP_PUBLISH_PROFILE"
echo ""
az webapp deployment list-publishing-profiles \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --xml

echo ""
echo "3) 推送 main 分支触发部署，或手动运行 workflow。"
echo "4) 应用 URL: https://${APP_NAME}.azurewebsites.net"
echo ""
echo "（可选）持久化存档：默认 store.json 在容器本地盘，重启可能丢失。"
echo "    见本目录 README.md — 挂载 Azure Files。"

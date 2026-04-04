#!/usr/bin/env bash
# Creates resource group, Linux App Service plan, and Web App (Node 20) via Azure CLI.
# Prerequisites: Azure CLI installed, `az login`, correct subscription (`az account show`).
set -euo pipefail

LOCATION="${LOCATION:-eastasia}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-game-sanguo-prod}"
PLAN_NAME="${PLAN_NAME:-plan-game-sanguo-linux}"
# Must be globally unique; override APP_NAME with your own prefix (2–60 chars, alphanumeric).
APP_NAME="${APP_NAME:-game-sanguo-$(openssl rand -hex 4)}"
SKU="${SKU:-B1}"

echo "==> Resource group: $RESOURCE_GROUP | Region: $LOCATION | App name: $APP_NAME | Plan SKU: $SKU"

# App Service requires the Microsoft.Web resource provider on the subscription.
RS="$(az provider show --namespace Microsoft.Web --query registrationState -o tsv 2>/dev/null || true)"
if [[ "${RS:-}" != "Registered" ]]; then
  echo "==> Registering resource provider Microsoft.Web (current state: ${RS:-unknown})..."
  az provider register --namespace Microsoft.Web --wait
  echo "==> Microsoft.Web is registered."
else
  echo "==> Microsoft.Web provider already registered."
fi

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

# Matches GitHub Actions zip layout: wwwroot contains server/ and client/
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
echo "Enter production JWT_SECRET (leave empty to skip; configure later in the portal):"
read -r JWT_SECRET || true
if [[ -n "${JWT_SECRET:-}" ]]; then
  az webapp config appsettings set \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --settings NODE_ENV=production JWT_SECRET="$JWT_SECRET" \
    --output none
  echo "Set NODE_ENV and JWT_SECRET."
else
  echo "JWT_SECRET not set. Add it under Configuration > Application settings before going live."
fi

echo ""
echo "========== Next steps =========="
echo "1) In the GitHub repo: Settings > Secrets and variables > Actions, add:"
echo "   AZURE_WEBAPP_NAME = $APP_NAME"
echo "2) Paste the full publish profile XML below into secret AZURE_WEBAPP_PUBLISH_PROFILE"
echo ""
az webapp deployment list-publishing-profiles \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --xml

echo ""
echo "3) Push to main (or master) to deploy, or run the workflow manually."
echo "4) App URL: https://${APP_NAME}.azurewebsites.net"
echo ""
echo "(Optional) Persistence: default store.json lives on local container disk and may be lost on recycle."
echo "    See README.md in this folder for Azure Files mount."

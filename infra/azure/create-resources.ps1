#Requires -Version 5.1
<#
.SYNOPSIS
    Creates a Linux App Service Web App (Node 20) using Azure CLI (same intent as create-resources.sh).
.DESCRIPTION
    Requires Azure CLI and `az login`.
#>
param(
    [string]$Location = "eastasia",
    [string]$ResourceGroup = "rg-game-sanguo-prod",
    [string]$PlanName = "plan-game-sanguo-linux",
    [string]$AppName = "",
    [string]$Sku = "B1"
)

$ErrorActionPreference = "Stop"

if (-not $AppName) {
    $rand = -join ((48..57) + (97..102) | Get-Random -Count 8 | ForEach-Object { [char]$_ })
    $AppName = "game-sanguo-$rand"
}

Write-Host "==> RG: $ResourceGroup | Location: $Location | App: $AppName | SKU: $Sku"

az group create --name $ResourceGroup --location $Location

az appservice plan create `
    --resource-group $ResourceGroup `
    --name $PlanName `
    --is-linux `
    --sku $Sku

az webapp create `
    --resource-group $ResourceGroup `
    --plan $PlanName `
    --name $AppName `
    --runtime "NODE:20-lts"

az webapp config set `
    --resource-group $ResourceGroup `
    --name $AppName `
    --startup-file "node server/src/index.js"

az webapp update `
    --resource-group $ResourceGroup `
    --name $AppName `
    --https-only true

if ($Sku -notin @("F1", "FREE")) {
    az webapp config set `
        --resource-group $ResourceGroup `
        --name $AppName `
        --always-on true
}

$jwt = Read-Host "Enter JWT_SECRET for production (leave empty to configure later in the portal)"
if ($jwt) {
    az webapp config appsettings set `
        --resource-group $ResourceGroup `
        --name $AppName `
        --settings NODE_ENV=production JWT_SECRET=$jwt `
        --output none
    Write-Host "Set NODE_ENV and JWT_SECRET."
}
else {
    Write-Host "JWT_SECRET not set. Add it under Configuration > Application settings in the portal."
}

Write-Host ""
Write-Host "========== Next steps =========="
Write-Host "1) GitHub Secrets: AZURE_WEBAPP_NAME = $AppName"
Write-Host "2) Paste the full publish profile XML below into AZURE_WEBAPP_PUBLISH_PROFILE"
Write-Host ""
az webapp deployment list-publishing-profiles --name $AppName --resource-group $ResourceGroup --xml

Write-Host ""
Write-Host "3) Push to main to deploy. URL: https://$AppName.azurewebsites.net"

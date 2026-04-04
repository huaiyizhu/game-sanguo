#Requires -Version 5.1
<#
.SYNOPSIS
    使用 Azure CLI 创建 Linux App Service + Node 20 Web 应用（与 create-resources.sh 等价）
.DESCRIPTION
    需已安装 Azure CLI 并执行 az login
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

$jwt = Read-Host "输入 JWT_SECRET（留空稍后在门户配置）"
if ($jwt) {
    az webapp config appsettings set `
        --resource-group $ResourceGroup `
        --name $AppName `
        --settings NODE_ENV=production JWT_SECRET=$jwt `
        --output none
    Write-Host "已写入 NODE_ENV、JWT_SECRET。"
}
else {
    Write-Host "未设置 JWT_SECRET，请在门户「应用程序设置」中配置。"
}

Write-Host ""
Write-Host "========== 下一步 =========="
Write-Host "1) GitHub Secrets: AZURE_WEBAPP_NAME = $AppName"
Write-Host "2) 将下列发布配置 XML 完整粘贴到 AZURE_WEBAPP_PUBLISH_PROFILE"
Write-Host ""
az webapp deployment list-publishing-profiles --name $AppName --resource-group $ResourceGroup --xml

Write-Host ""
Write-Host "3) 推送 main 触发部署。URL: https://$AppName.azurewebsites.net"

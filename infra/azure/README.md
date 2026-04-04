# Azure 部署说明（game-sanguo）

## 技术选型（推荐）

| 组件 | 选择 | 说明 |
|------|------|------|
| 计算 | **Azure App Service（Linux）** | 与当前架构一致：Node `Express` 托管 `client/dist` + `/api`，单应用、运维简单。 |
| 运行时 | **Node 20 LTS** | 与 CI 中 `setup-node` 一致。 |
| 计划 | **B1（Basic）** 起步 | 可开 Always On；免费 **F1** 可试用但有冷启动、资源限制。 |
| CI/CD | **GitHub Actions** + `azure/webapps-deploy` | 发布配置文件（Publish Profile）接入最快；进阶可改用 **OpenID Connect** 免长期密钥。 |
| 数据 | **本地 JSON 文件**（默认） | `server/data/store.json` 在容器本地盘，**扩缩容/重启可能丢数据**。生产建议见下文「持久化」。 |

未选 **Azure Static Web Apps + Functions**：需要把 Express API 迁到 Functions，改动大。未选 **Container Apps**：对你当前单体应用而言增加镜像与注册表成本，可作为后续演进方向。

## 一键创建 Azure 资源

1. 安装 [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)，执行 `az login`，确认订阅：`az account show`。
2. **Linux / macOS / Git Bash：**

   ```bash
   cd infra/azure
   chmod +x create-resources.sh
   # 可选环境变量：LOCATION、RESOURCE_GROUP、APP_NAME（必须全局唯一）、SKU
   ./create-resources.sh
   ```

3. **Windows PowerShell：**

   ```powershell
   cd infra\azure
   .\create-resources.ps1
   # 可传参：-Location japaneast -Sku B1 -AppName myuniqueappname
   ```

脚本会输出 **发布配置文件 XML**。将其完整复制到 GitHub：

- 仓库 → **Settings** → **Secrets and variables** → **Actions**
- `AZURE_WEBAPP_NAME` = Web 应用名称（脚本结束处有提示）
- `AZURE_WEBAPP_PUBLISH_PROFILE` = 整段 XML

## GitHub Actions

工作流：`.github/workflows/azure-app-service.yml`

- **Pull Request**：仅执行 `npm ci` + 构建前端。
- **推送到 `main` / `master`**：构建并部署到 App Service。

## 应用配置（必做）

在 Azure 门户 → 你的 Web 应用 → **配置** → **应用程序设置** 中至少设置：

| 名称 | 说明 |
|------|------|
| `JWT_SECRET` | 正式环境务必为**长随机字符串**（与本地 `.env` 同理）。 |
| `NODE_ENV` | `production`（脚本或 CLI 可能已写入）。 |

Azure 会为应用注入 `PORT`，Express 已使用 `process.env.PORT`，无需再改代码。

**启动命令**（脚本已写入）：`node server/src/index.js`  
（站点根目录解压后为 `server/` + `client/dist/`，与 `server/src/index.js` 里相对路径一致。）

## 持久化存档（可选）

默认 `store.json` 在容器文件系统，**非持久**。若需长期保存用户与存档：

1. 创建 **存储帐户** + **文件共享**（Azure Files）。
2. 在 App Service → **配置** → **路径映射**，将共享挂载到例如 `/home/data`。
3. 将应用配置为在该路径读写（需改 `server/src/store.js` 的数据目录，属产品改动，此处仅作架构提示）。

或使用 **Azure Database for PostgreSQL** 等托管数据库，需自行实现存储层替换 JSON。

## 进阶：用 OIDC 代替 Publish Profile

发布配置文件等价于部署凭据，建议定期轮换。更稳妥做法：Azure 企业应用程序 + 联合凭据，在 Workflow 中使用 `azure/login` + RBAC，对 Web 应用授予 `Website Contributor`。详见：

- [使用 OpenID Connect 从 GitHub Actions 部署到 Azure](https://learn.microsoft.com/azure/developer/github/connect-from-azure)

## 费用与区域

- 区域可用 `eastasia` / `japaneast` 等，按延迟与合规选择。
- 定价以 [App Service 定价](https://azure.microsoft.com/pricing/details/app-service/linux/) 为准；脚本默认 **B1**。

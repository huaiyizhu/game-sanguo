# Azure 部署说明（game-sanguo）

## 技术选型

| 组件 | 选择 | 说明 |
|------|------|------|
| 计算 | **Azure App Service（Linux）** | 与当前架构一致：Node `Express` 托管 `client/dist` + `/api`，单应用、运维简单。 |
| 运行时 | **Node 20 LTS** | 与 CI 中 `setup-node` 一致。 |
| 计划 | **B1（Basic）** 起步 | 可开 Always On；免费 **F1** 可试用但有冷启动、资源限制。 |
| CI/CD | **GitHub Actions** + `azure/webapps-deploy` | 发布配置文件（Publish Profile）接入最快；进阶可改用 **OpenID Connect** 免长期密钥。 |
| 数据 | **本地 JSON 文件**（默认） | `server/data/store.json` 在容器本地盘，**扩缩容/重启可能丢数据**。生产建议见下文「持久化」。 |

未选 **Azure Static Web Apps + Functions**：需要把 Express API 迁到 Functions，改动大。未选 **Container Apps**：对你当前单体应用而言增加镜像与注册表成本，可作为后续演进方向。

## 一键创建 Azure 资源

1. 安装 [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)，执行 `az login`，确认订阅：`az account show`。若订阅尚未注册 **`Microsoft.Web`**，脚本会在创建资源前自动执行 `az provider register --namespace Microsoft.Web --wait`（已注册则跳过）。
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

### 故障排除：`Publish profile is invalid for app-name and slot-name provided`

`azure/webapps-deploy` 会用 **发布配置文件里的 `userName`**（去掉开头的 `$` 后按 `__` 分段）和你在 **`AZURE_WEBAPP_NAME`** 里填的名字做比对，不一致就会报这个错。日志里的 `Failed to get app runtime OS` 往往也是后续校验/调用失败的表现。

请逐项核对：

1. **`AZURE_WEBAPP_NAME` 必须是资源名称本身**  
   正确：`my-game-app`  
   错误：`my-game-app.azurewebsites.net`、`https://...`、前后空格或换行（工作流已对名称做 **trim**，但请避免 Secret 里故意带换行）。

2. **发布配置要用「完整 XML」**  
   推荐在 Azure 门户打开该 Web 应用 → **概览** → **下载发布配置文件**，用文本编辑器打开 `.PublishSettings`，**整份**复制到 `AZURE_WEBAPP_PUBLISH_PROFILE`。  
   不要只复制其中一段；内容应包含 `publishProfile` / `publishData` 等节点（工作流会检查长度与关键字）。

3. **Secret 名称必须与工作流一致**  
   应为 `AZURE_WEBAPP_PUBLISH_PROFILE`（不是 `AZURE_PUBLISH_PROFILE` 等拼写变体）。

4. **启用 SCM 基本身份验证（很常见原因）**  
   若关闭了发布用的基本身份验证，发布配置会无效或行为异常。请在门户中检查：  
   **应用服务 → 配置 → 常规设置** 中与 **SCM / FTP / 基本身份验证** 相关的选项，确保允许通过发布凭据部署（具体名称随门户版本可能为 *Basic auth* / *FTP* / *SCM* 等，以你当前界面为准）。  
   修改后建议 **重新下载发布配置文件** 并更新 GitHub Secret。

5. **订阅或应用是否一致**  
   发布配置文件必须来自 **当前要部署的这一个** Web 应用；换了应用或重置过凭据后，要重新下载并更新 Secret。

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

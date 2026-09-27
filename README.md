# MiniMax STT → OpenAI-compatible API（Bun）

这是一个使用 **Bun + TypeScript** 编写的 MiniMax 语音转文字代理，把 MiniMax `asr-1.0` 包装成 OpenAI 兼容的 Speech-to-Text API。

项目适合部署在独立服务器上，再通过 HTTPS 反向代理提供给 Voxtype 或其他 OpenAI-compatible 客户端使用。

## 当前状态

项目已经可以部署使用，并已完成以下验证：

- Bun 单元测试和 TypeScript 类型检查通过
- Docker 镜像可以正常构建
- Docker 容器可以正常启动并通过 Healthcheck
- `/healthz`、模型列表和代理鉴权正常
- 已通过 Docker 容器真实调用 MiniMax 转写接口
- 容器进程使用非 root 用户 `bun` 运行
- Docker 镜像已发布到 `docker.io/yaotutu/minimax-stt`

## 功能

- `POST /v1/audio/transcriptions`
- 兼容 `POST /audio/transcriptions`
- `GET /v1/models`
- `GET /v1/models/:id`
- `GET /healthz`
- 支持模型别名：`minimax-asr-1.0`、`asr-1.0`
- 支持 `json`、`text`、`verbose_json`、`diarized_json`、`srt`、`vtt`
- 支持 MiniMax `stream=true`，转换为 OpenAI 风格 SSE
- 可选代理鉴权：`PROXY_API_KEY`
- 单个音频文件限制 50 MiB
- 可配置 MiniMax 上游请求超时
- CORS 和 `OPTIONS` 预检支持

MiniMax 上游地址默认为：

```text
https://api.minimax.cn/v1/speech_to_text
```

## 快速开始：Docker Compose（普通用户，无需 `.env`）

下面的部署流程按普通 Linux 用户执行，不要求创建或提交 `.env` 文件。Docker 服务本身通常由系统以 root 权限运行，但用户加入 `docker` 组后，日常执行 `docker` 和 `docker compose` 命令不需要 `sudo`。只有首次配置用户组时可能需要管理员权限。

### 1. 确认当前用户可以使用 Docker

先直接检查当前用户是否已经可以访问 Docker：

```bash
docker ps
```

如果执行 Docker 命令时出现：

```text
permission denied while trying to connect to the Docker API
```

可以把当前用户加入 `docker` 组：

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker ps
```

也可以退出当前登录会话后重新登录，使用户组变更永久生效。

### 2. 设置启动参数

`compose.yaml` 通过当前 Shell 的环境变量接收密钥，不依赖 `.env` 文件：

```bash
export MINIMAX_API_KEY='你的 MiniMax API Key'
export PROXY_API_KEY='随机生成的代理访问密钥'
```

`PROXY_API_KEY` 是可选的。如果不设置，服务不会校验代理访问密钥；生产环境建议设置。

不要把真实密钥提交到仓库，也不要把包含真实密钥的命令保存到公开脚本中。

### 3. 使用 Docker Hub 镜像启动

默认使用已经发布到 Docker Hub 的镜像：

```bash
docker compose pull
docker compose up -d --no-build
```

生产环境建议锁定版本：

```bash
export DOCKERHUB_IMAGE=yaotutu/minimax-stt:0.1.0
docker compose pull
docker compose up -d --no-build
```

如果希望在本机重新构建而不是使用 Docker Hub 镜像：

```bash
docker compose up -d --build
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f minimax-stt
```

### 4. 验证服务

健康检查不需要代理 Key：

```bash
curl http://127.0.0.1:18080/healthz
```

预期结果：

```json
{"status":"ok"}
```

模型列表需要代理 Key：

```bash
curl http://127.0.0.1:18080/v1/models \
  -H "Authorization: Bearer $PROXY_API_KEY"
```

默认的 `compose.yaml` 只把服务绑定到服务器本机：

```text
127.0.0.1:18080
```

这样可以避免直接把服务暴露到公网。正式使用时，建议通过 Nginx、Caddy 或 Traefik 配置 HTTPS 反向代理。

### 5. 一条命令启动

如果不想提前执行 `export`，也可以直接在命令前传入环境变量：

```bash
MINIMAX_API_KEY='你的 MiniMax API Key' \
PROXY_API_KEY='随机生成的代理访问密钥' \
docker compose up -d --no-build
```

这条命令同样不依赖 `.env` 文件。

## 直接使用 `docker run`（无需 `.env`）

如果不使用 Compose，也可以直接运行 Docker Hub 镜像：

```bash
docker pull docker.io/yaotutu/minimax-stt:0.1.0

docker run -d \
  --name minimax-stt \
  --restart unless-stopped \
  -e MINIMAX_API_KEY='你的 MiniMax API Key' \
  -e PROXY_API_KEY='随机生成的代理访问密钥' \
  -p 127.0.0.1:18080:18080 \
  docker.io/yaotutu/minimax-stt:0.1.0
```

查看日志和停止服务：

```bash
docker logs -f minimax-stt
docker stop minimax-stt
docker rm minimax-stt
```

如果不需要代理层鉴权，可以省略 `PROXY_API_KEY`；生产环境建议保留。真实密钥会被 Docker 保存为容器环境变量，生产环境可根据需要改用 Docker Secrets 或其他密钥管理方案。

## 发布到 Docker Hub

`compose.yaml` 支持通过 `DOCKERHUB_IMAGE` 指定镜像名称。默认使用 Docker Hub 镜像：

```text
yaotutu/minimax-stt:latest
```

如果需要优先使用本地构建镜像，可以显式覆盖：

```bash
export DOCKERHUB_IMAGE=minimax-stt:latest
```

准备发布时，先在 Docker Hub 创建一个仓库，例如：

```text
yaotutu/minimax-stt
```

然后在服务器上登录 Docker Hub。建议使用 Docker Hub Access Token，不要在聊天或脚本中保存密码：

```bash
docker login
```

构建并推送带版本号和 `latest` 标签的镜像：

```bash
export DOCKERHUB_IMAGE=docker.io/yaotutu/minimax-stt
export IMAGE_VERSION=0.1.0

docker build -t "$DOCKERHUB_IMAGE:$IMAGE_VERSION" -t "$DOCKERHUB_IMAGE:latest" .
docker push "$DOCKERHUB_IMAGE:$IMAGE_VERSION"
docker push "$DOCKERHUB_IMAGE:latest"
```

其他服务器使用 Docker Hub 镜像时，需要先在当前 Shell 设置 MiniMax API Key：

```bash
export MINIMAX_API_KEY='你的 MiniMax API Key'
export PROXY_API_KEY='随机生成的代理访问密钥'
export DOCKERHUB_IMAGE=docker.io/yaotutu/minimax-stt

docker compose pull
docker compose up -d --no-build
```

如果仓库是私有仓库，目标服务器也需要先执行 `docker login`。建议生产环境优先使用固定版本号，不要只依赖 `latest`：

```bash
export DOCKERHUB_IMAGE=docker.io/yaotutu/minimax-stt:0.1.0
```

## Docker 测试端口

如果服务器上的 `18080` 已经有其他服务，可以使用临时端口验证镜像：

```bash
docker build -t minimax-stt:latest .
docker run -d \
  --name minimax-stt-test \
  --restart unless-stopped \
  -e MINIMAX_API_KEY='你的 MiniMax API Key' \
  -e PROXY_API_KEY='随机生成的代理访问密钥' \
  -p 127.0.0.1:18081:18080 \
  minimax-stt:latest
```

验证：

```bash
curl http://127.0.0.1:18081/healthz
```

测试完成后清理：

```bash
docker rm -f minimax-stt-test
```

项目的正式 Compose 配置仍然使用 `18080`，临时测试端口不会修改 `compose.yaml`。

## HTTPS 反向代理

反向代理完成后，对外地址例如：

```text
https://stt.example.com
```

客户端的 OpenAI `base_url` 使用：

```text
https://stt.example.com/v1
```

反向代理建议注意：

- 上传大小至少允许 50 MiB
- 上游超时时间至少设置为 120 秒
- 流式请求关闭响应缓冲或适当配置 SSE
- 对外只开放 HTTPS
- 保留 `Authorization` 请求头

不建议直接把 `18080` 暴露到公网。

## 直接使用 Bun

如果服务器已经安装 Bun，也可以不使用 Docker：

```bash
bun install --frozen-lockfile
cp deploy/minimax-stt.env.example .env
chmod 600 .env
vim .env
bun run start
```

生产环境建议使用 Docker Compose、systemd、Supervisor 或其他进程管理器运行服务。

## Voxtype 连接远程服务器

Voxtype 运行在客户端机器上，录音文件会发送到服务器上的代理。

远程服务器地址不要写 `/v1`，Voxtype 会自动拼接 API 路径：

```toml
engine = whisper
whisper.mode = remote
whisper.remote_endpoint = https://stt.example.com
whisper.remote_model = minimax-asr-1.0
whisper.language = zh
```

最终请求地址是：

```text
https://stt.example.com/v1/audio/transcriptions
```

如果服务器设置了 `PROXY_API_KEY`，Voxtype 还需要配置对应的远程请求 Header：

```http
Authorization: Bearer <PROXY_API_KEY>
```

F9 快捷键仍然由客户端本地的 Voxtype 负责，服务器只负责接收音频并调用 MiniMax 转写。

## API 示例

### 健康检查

```bash
curl https://stt.example.com/healthz
```

### 查询模型

```bash
curl https://stt.example.com/v1/models \
  -H "Authorization: Bearer $PROXY_API_KEY"
```

### 识别音频

```bash
curl https://stt.example.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $PROXY_API_KEY" \
  -F "file=@./audio.mp3" \
  -F "model=minimax-asr-1.0" \
  -F "language=zh" \
  -F "response_format=json"
```

### 流式识别

```bash
curl https://stt.example.com/v1/audio/transcriptions \
  -N \
  -H "Authorization: Bearer $PROXY_API_KEY" \
  -F "file=@./audio.mp3" \
  -F "model=minimax-asr-1.0" \
  -F "language=zh" \
  -F "response_format=json" \
  -F "stream=true"
```

流式模式目前只支持 `response_format=json`。

## OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-proxy-key",
    base_url="https://stt.example.com/v1",
)

with open("audio.mp3", "rb") as audio:
    result = client.audio.transcriptions.create(
        model="minimax-asr-1.0",
        file=audio,
        response_format="json",
        language="zh",
    )

print(result.text)
```

## 配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MINIMAX_API_KEY` | 无 | MiniMax API Key，必填 |
| `PROXY_API_KEY` | 空 | 代理鉴权；设置后要求 Bearer token |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `PORT` | `18080` | 容器内服务端口 |
| `MINIMAX_BASE_URL` | `https://api.minimax.cn` | MiniMax 上游地址，一般不需要修改 |
| `REQUEST_TIMEOUT_MS` | `120000` | 上游请求超时，单位为毫秒 |

## 开发与测试

安装依赖并运行测试：

```bash
bun install --frozen-lockfile
bun run check
```

`bun run check` 包含：

```bash
bun test
bun run typecheck
```

构建 Docker 镜像（构建阶段不需要真实 API Key）：

```bash
docker build -t minimax-stt:latest .
```

## 常见问题

### Docker 权限错误

执行：

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker ps
```

如果仍然不生效，请退出当前终端或重新登录系统。

### 端口已被占用

查看端口占用：

```bash
ss -ltnp | grep 18080
```

如果当前已经有 Bun 进程运行，请先停止它，再使用 Docker Compose 接管 `18080` 端口；或者按照上面的 Docker 测试端口方式使用 `18081`。

### 服务启动后立即退出

查看日志：

```bash
docker compose logs --tail=100 minimax-stt
```

最常见原因是：

- 当前 Shell 没有设置 `MINIMAX_API_KEY`
- 如果使用 Bun 直接运行，`.env` 不在项目根目录
- `PORT` 不是正整数
- Docker daemon 未运行

## 安全注意事项

- 不要提交真实的 `MINIMAX_API_KEY` 或 `PROXY_API_KEY`
- 如果使用 Bun 直接运行或自行采用 `.env`，服务器上的 `.env` 建议使用 `chmod 600 .env`
- 对公网提供服务时必须设置 `PROXY_API_KEY`，并使用 HTTPS
- 反向代理上传大小至少允许 50 MiB
- 反向代理应设置足够的上游超时时间
- 如果密钥曾经出现在聊天、终端输出或日志中，应在 MiniMax 控制台撤销并重新生成

# pi-env-allowlist

一个 [Pi](https://pi.dev) 扩展：让内置 `bash` 工具只继承白名单内的环境变量，并拦截对 `/proc/*/environ`、`/proc/*/mem` 的直接读取。

Pi 默认把整个进程环境变量传给每一条 bash 命令。启动前导出的 API key，距离模型上下文、provider 请求和会话文件只差一个 `env`。本扩展用 `spawnHook` 替换 `bash` 工具，只保留配置文件里 `allow` 匹配到的变量名。

## 从 GitHub 安装

```sh
pi install git:github.com/<you>/pi-env-allowlist
```

固定 tag 或 commit：

```sh
pi install git:github.com/<you>/pi-env-allowlist@v0.1.0
```

只试用一次、不写入 settings：

```sh
pi -e git:github.com/<you>/pi-env-allowlist
```

包没有运行时依赖，Pi 通过 `package.json` 的 `pi.extensions` 加载 `./src/index.js`。

如果之前把本地副本放在 `~/.pi/agent/extensions/env-allowlist`，请先删掉，否则两份会同时注册 `bash` 工具和钩子。

## 配置

首次运行时如果 `~/.pi/agent/env-allowlist.json` 不存在，扩展会自动写入内置模板（权限 `0600`）并给出一条提示。之后编辑这个生成的文件即可：只要文件存在，它就是白名单的唯一来源；删除它会在下一条命令时重新生成。

生成的内容与 [`config/env-allowlist.example.json`](config/env-allowlist.example.json) 一致：

```json
{
  "allow": ["PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_*", "TMPDIR", "PI_*"],
  "deny": ["SSH_AUTH_SOCK"]
}
```

- `allow` / `deny` 是变量名的 glob 模式（`*` 任意长度，`?` 单个字符）。
- `deny` 优先于 `allow`。
- 只作用于 `bash` 工具的子进程环境。
- 改完下一条命令生效，不需要 reload。
- 文件缺失时自动重建模板；文件非法时**失败关闭**：命令被拒绝，报错会指出文件和原因。

`PI_*` 是 Pi 注入的会话信息，不含凭据。`SSH_AUTH_SOCK` 默认不放行，因为它等于授予 ssh-agent 的签名能力。

## 拦截规则

`tool_call` 钩子会拒绝：

- 同时提到 `/proc` 与 `environ` 或 `mem` 的 bash 命令；
- 指向 `/proc/**/environ`、`/proc/**/mem` 的 `read` / `grep` 路径。

它能挡住 `cat /proc/$PPID/environ`、`dd if=/proc/3017/mem`、`open("/proc/3017/environ")` 这类直白写法。这是黑名单，不是边界：`ps e`、编码后的路径（`base64 -d <<< ... | sh`）、字符串拼接、ptrace 读取仍然可以拿到同样的数据。

## 限制

这是纵深防御，不是沙箱。

- 只过滤传给 `bash` 的环境变量，不限制进程能读哪些文件或 `/proc`。
- `ps e`、`/proc/<pid>/mem`、编码路径可绕过 `/proc` 拦截。
- `read` 仍可读取 `~/.pi/agent/auth.json`、`~/.aws/credentials` 等凭据文件；文件访问不在范围内。
- 你自己用 `!` / `!!` 输入的命令不过滤。
- 不使用命名空间，所以 dev server、watcher 等后台进程可以跨命令存活。
- 如果 shell profile、`direnv` 或 `BASH_ENV` 又导出了凭据，它会重新出现在子进程环境里。

需要强制边界时，请使用 OS 沙箱、容器或独立用户，并让凭据短时、限权、可撤销。

## 开发

```sh
npm test        # node --test，无依赖
```

```
src/index.js    扩展入口（bash 工具 + tool_call 拦截）
src/lib.js      配置解析、glob、env 过滤、/proc 匹配
config/         示例配置
test/           单元测试
```

## License

MIT

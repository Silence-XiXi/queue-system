# 打印机 DLL 集成指南

本指南说明如何将打印机 DLL 集成到系统中。

## 前置要求

1. **安装 Node.js 依赖**
   ```bash
   npm install ffi-napi ref-napi ref-struct-napi ref-array-napi
   ```

2. **准备打印机 DLL 文件**
   - 将打印机 SDK 提供的 DLL 文件复制到项目目录
   - 建议放在 `queueSystem-server/printer_sdk/` 目录下
   - 或者设置环境变量 `PRINTER_DLL_PATH` 指定 DLL 路径

## DLL 函数签名配置

### 步骤 1: 了解 DLL 函数签名

首先需要了解打印机 DLL 提供的函数及其签名。常见的函数可能包括：

- `InitPrinter()` - 初始化打印机
- `PrintTicket(...)` - 打印票号
- `ClosePrinter()` - 关闭打印机连接

### 步骤 2: 修改 printerService.js

打开 `queueSystem-server/services/printerService.js`，找到以下部分并修改：

```javascript
const printerLib = ffi.Library(DLL_PATH, {
  // 根据实际 DLL 函数签名修改这里
  'PrintTicket': ['int', ['string', 'string', 'int']],  // 示例
  'InitPrinter': ['int', []],
  'ClosePrinter': ['int', []],
});
```

### 步骤 3: 实现打印函数

在 `printTicket` 函数中，根据实际的 DLL 函数调用：

```javascript
// 示例：调用 PrintTicket 函数
const result = printerDll.PrintTicket(
  ticket_number,        // 票号
  business_type_name,   // 业务类型
  waiting_count         // 等待人数
);

if (result === 0) {
  return { success: true, message: '打印成功' };
} else {
  return { success: false, message: `打印失败，错误代码: ${result}` };
}
```

## 常见 DLL 函数签名类型

### 1. 使用 ANSI 字符串（char*）

```javascript
const printerLib = ffi.Library(DLL_PATH, {
  'PrintTicket': ['int', ['string', 'string', 'int']],
});
```

### 2. 使用 Unicode 字符串（wchar_t*）

```javascript
const printerLib = ffi.Library(DLL_PATH, {
  'PrintTicket': ['int', ['wstring', 'wstring', 'int']],
});
```

### 3. 带日期时间参数

```javascript
const printerLib = ffi.Library(DLL_PATH, {
  'PrintTicketEx': ['int', ['string', 'string', 'string', 'string', 'int']],
});

// 调用
const result = printerDll.PrintTicketEx(
  ticket_number,
  business_type_name,
  dateStr,
  timeStr,
  waiting_count
);
```

### 4. 使用结构体参数

如果 DLL 使用结构体，需要使用 `ref-struct-napi`：

```javascript
const Struct = require('ref-struct-napi');
const ref = require('ref-napi');

// 定义结构体
const TicketInfo = Struct({
  ticketNumber: 'string',
  businessType: 'string',
  waitingCount: 'int'
});

const printerLib = ffi.Library(DLL_PATH, {
  'PrintTicket': ['int', [TicketInfo]],
});

// 使用
const ticketInfo = new TicketInfo({
  ticketNumber: ticket_number,
  businessType: business_type_name,
  waitingCount: waiting_count
});
const result = printerDll.PrintTicket(ticketInfo);
```

## 数据类型映射

| C++ 类型 | ffi-napi 类型 |
|---------|--------------|
| `int` | `'int'` |
| `long` | `'long'` |
| `char*` | `'string'` |
| `wchar_t*` | `'wstring'` |
| `void*` | `'pointer'` |
| `bool` | `'bool'` |
| `float` | `'float'` |
| `double` | `'double'` |

## 测试

1. **测试 DLL 加载**
   ```javascript
   const printerService = require('./services/printerService');
   console.log('打印机可用:', printerService.isAvailable());
   ```

2. **测试打印功能**
   在取票时，系统会自动调用打印功能。查看控制台日志确认是否成功。

## 故障排除

### 问题 1: DLL 加载失败

**错误信息**: `Cannot find module` 或 `The specified module could not be found`

**解决方案**:
- 确认 DLL 文件路径正确
- 确认 DLL 文件存在
- 检查 DLL 依赖的其他库是否已安装（使用 Dependency Walker 工具检查）

### 问题 2: 函数调用失败

**错误信息**: `ffi: Invalid function signature`

**解决方案**:
- 检查函数签名是否正确
- 确认参数类型匹配（string vs wstring）
- 确认参数顺序和数量正确

### 问题 3: 字符串编码问题

**解决方案**:
- 如果 DLL 使用 ANSI，使用 `'string'`
- 如果 DLL 使用 Unicode，使用 `'wstring'`
- 确保字符串编码正确

### 问题 4: 需要管理员权限

某些打印机 DLL 可能需要管理员权限运行。

## 环境变量配置

可以通过环境变量配置 DLL 路径：

```bash
# Windows
set PRINTER_DLL_PATH=C:\path\to\PrinterSDK.dll

# Linux (如果支持)
export PRINTER_DLL_PATH=/path/to/PrinterSDK.so
```

或在代码中直接修改 `printerService.js` 中的 `DLL_PATH` 常量。

## 示例：完整的打印机服务配置

假设你的 DLL 有以下函数：

```cpp
// C++ 头文件示例
int InitPrinter();
int PrintTicket(const char* ticketNumber, const char* businessType, int waitingCount);
int ClosePrinter();
```

对应的 Node.js 配置：

```javascript
const printerLib = ffi.Library(DLL_PATH, {
  'InitPrinter': ['int', []],
  'PrintTicket': ['int', ['string', 'string', 'int']],
  'ClosePrinter': ['int', []],
});

// 在 initPrinter 中
const result = printerDll.InitPrinter();
return result === 0;

// 在 printTicket 中
const result = printerDll.PrintTicket(
  ticket_number,
  business_type_name,
  waiting_count
);
return result === 0 ? { success: true } : { success: false, message: `错误代码: ${result}` };

// 在 closePrinter 中
const result = printerDll.ClosePrinter();
return result === 0;
```

## 注意事项

1. **错误处理**: 打印失败不应影响取票流程，系统会记录错误但继续执行
2. **异步调用**: DLL 调用是同步的，如果打印时间较长，考虑使用 `setImmediate` 或 `process.nextTick` 避免阻塞
3. **资源管理**: 如果 DLL 需要初始化/关闭，确保在应用启动/关闭时正确调用
4. **跨平台**: ffi-napi 主要支持 Windows，Linux 和 macOS 可能需要不同的配置


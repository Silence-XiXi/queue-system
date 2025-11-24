# 打印机 DLL 集成总结

## 已完成的集成工作

### 1. 创建打印机服务模块
- **文件**: `queueSystem-server/services/printerService.js`
- **功能**: 
  - 使用 `ffi-napi` 加载和调用打印机 DLL
  - 提供 `initPrinter()`, `printTicket()`, `closePrinter()` 接口
  - 包含错误处理和模拟模式（DLL 未加载时）

### 2. 集成到取票流程
- **文件**: `queueSystem-server/services/ticketService.js`
- **修改**: 在 `createTicket()` 函数中，取票成功后自动调用打印机打印票号
- **特点**: 打印失败不影响取票流程，只记录警告日志

### 3. 文档和示例
- **快速开始**: `printer_example/QUICKSTART.md`
- **详细文档**: `printer_example/README.md`
- **使用示例**: `printer_example/example-usage.js`

## 使用流程

1. **用户在前端取票页面点击取票**
2. **前端调用 API**: `POST /tickets`
3. **后端处理**:
   - 创建票号记录
   - **自动调用打印机打印票号** ← 新增功能
   - 返回票号信息给前端
4. **前端显示票号信息**

## 下一步操作

### 必须完成的配置

1. **安装依赖**:
   ```bash
   cd queueSystem-server
   npm install ffi-napi ref-napi ref-struct-napi ref-array-napi
   ```

2. **放置 DLL 文件**:
   - 将打印机 DLL 文件放到 `queueSystem-server/printer_sdk/` 目录
   - 或设置环境变量 `PRINTER_DLL_PATH` 指定路径

3. **配置 DLL 函数签名**:
   - 打开 `services/printerService.js`
   - 根据实际的 DLL 函数签名修改代码
   - 参考 `printer_example/README.md` 中的示例

### 配置示例

假设你的 DLL 有以下函数：
```cpp
int PrintTicket(const char* ticketNumber, const char* businessType, int waitingCount);
```

在 `printerService.js` 中配置：
```javascript
const printerLib = ffi.Library(DLL_PATH, {
  'PrintTicket': ['int', ['string', 'string', 'int']],
});

// 在 printTicket 函数中调用
const result = printerDll.PrintTicket(
  ticket_number,
  business_type_name,
  waiting_count
);
```

## 文件结构

```
queueSystem-server/
├── services/
│   ├── printerService.js      ← 打印机服务（新增）
│   └── ticketService.js        ← 已集成打印功能
└── printer_example/
    ├── README.md               ← 详细文档
    ├── QUICKSTART.md           ← 快速开始
    ├── example-usage.js        ← 使用示例
    └── INTEGRATION_SUMMARY.md  ← 本文件
```

## 测试

1. 启动服务器后，在控制台查看是否有 "打印机 DLL 加载成功" 的日志
2. 在取票页面取一张票
3. 查看控制台日志，确认打印是否成功
4. 如果 DLL 未加载，会显示 "模拟打印" 的日志

## 注意事项

1. **打印失败不影响取票**: 即使打印失败，取票流程仍会继续，只记录警告
2. **DLL 路径**: 确保 DLL 文件路径正确，且 DLL 的所有依赖库都已安装
3. **函数签名**: 必须准确匹配 DLL 的函数签名，包括参数类型和顺序
4. **字符串编码**: 注意 DLL 使用的是 ANSI (`string`) 还是 Unicode (`wstring`)

## 故障排除

如果遇到问题，请查看：
- `printer_example/README.md` 中的故障排除部分
- 控制台错误日志
- 确认 DLL 文件是否存在且可访问


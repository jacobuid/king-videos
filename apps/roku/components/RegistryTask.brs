sub init()
    m.top.functionName = "execute"
end sub
sub execute()
    registry = CreateObject("roRegistrySection", "kingflix")
    input = m.top.input
    if input.operation = "load"
        m.top.result = {operation: "load", deviceToken: registry.Read("deviceToken"), profile: registry.Read("profile")}
        return
    end if
    if input.operation = "write" then registry.Write(input.key, input.value)
    if input.operation = "delete" then registry.Delete(input.key)
    registry.Flush()
    m.top.result = {operation: input.operation}
end sub

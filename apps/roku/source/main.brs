sub Main(args as dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.SetMessagePort(port)
    screen.CreateScene("KingflixScene")
    screen.Show()
    while true
        event = wait(0, port)
        if type(event) = "roSGScreenEvent" and event.IsScreenClosed() then return
    end while
end sub

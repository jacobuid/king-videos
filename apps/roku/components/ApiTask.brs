sub init()
    m.top.functionName = "execute"
end sub

sub execute()
    input = m.top.input
    transfer = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    transfer.SetPort(port)
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.SetUrl(input.url)
    transfer.AddHeader("Content-Type", "application/json")
    if input.token <> invalid and input.token <> "" then transfer.AddHeader("Authorization", "Bearer " + input.token)
    if input.profileToken <> invalid and input.profileToken <> "" then transfer.AddHeader("X-Profile-Token", input.profileToken)
    method = "GET"
    if input.method <> invalid then method = input.method
    transfer.SetRequest(method)
    transfer.RetainBodyOnError(true)
    if method = "GET"
        started = transfer.AsyncGetToString()
    else
        started = transfer.AsyncPostFromString(FormatJson(input.body))
    end if
    result = { tag: input.tag, kind: input.kind, status: 0, data: invalid, error: "Unable to connect. Please try again." }
    if started
        event = wait(30000, port)
        if type(event) = "roUrlEvent"
            result.status = event.GetResponseCode()
            result.data = ParseJson(event.GetString())
            if result.status >= 200 and result.status < 300
                if result.data <> invalid then result.error = "" else result.error = "The server returned an invalid response."
            else if result.data <> invalid and result.data.error <> invalid
                result.error = result.data.error
            end if
        else
            transfer.AsyncCancel()
        end if
    end if
    m.top.result = result
end sub

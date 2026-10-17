sub init()
    m.top.hideTextBox = true
    m.top.domain = "numeric"
    m.top.keyGrid.keyDefinitionUri = "pkg:/data/profile-pin-keyboard.json"
    m.top.keyGrid.horizWrap = false
    m.top.keyGrid.vertWrap = false
    m.top.textEditBox.secureMode = true
    m.top.textEditBox.maxTextLength = 4
    m.top.textEditBox.clearOnDownKey = false
end sub

function keySelected(key as string) as boolean
    return false
end function

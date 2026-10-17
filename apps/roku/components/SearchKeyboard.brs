sub init()
    palette = CreateObject("roSGNode", "RSGPalette")
    palette.colors = {KeyboardColor: "0x242628ff", PrimaryTextColor: "0xffffffff", SecondaryTextColor: "0xa4a4a4ff", FocusColor: "0xf3cc57ff", FocusItemColor: "0x17130aff", InputFieldColor: "0x00000000"}
    m.top.keyGrid.palette = palette
    m.top.textEditBox.palette = palette
    m.top.keyGrid.keyDefinitionUri = "pkg:/data/search-keyboard.json"
    m.top.keyGrid.mode = "letters"
    m.top.keyGrid.horizWrap = false
    m.top.keyGrid.vertWrap = false
    ' Remove the native text-box row and its reserved spacing from the key layout.
    ' SearchPage mirrors text into the independently positioned search field.
    m.top.hideTextBox = true
    m.top.textEditBox.width = 1290
    m.top.textEditBox.height = 65
    m.top.textEditBox.maxTextLength = 100
    m.top.textEditBox.clearOnDownKey = false
    m.top.textEditBox.hintText = "Search for movies or shows..."
    m.top.textEditBox.hintTextColor = "#a4a4a4"
    m.top.textEditBox.textColor = "#ffffff"
    m.top.textEditBox.backgroundUri = ""
    m.top.domain = "generic"
end sub

sub setInputFocus(active as boolean)
    m.top.keyGrid.focusVisible = active
    m.top.textEditBox.active = active
    if active
        m.top.setFocus(true)
    else
        m.top.setFocus(false)
    end if
end sub

function keySelected(key as string) as boolean
    if key = "letters" or key = "numbers" or key = "accents"
        m.top.keyGrid.mode = key
        m.top.keyGrid.jumpToKey = [0, 3, 0]
        return true
    end if
    return false
end function

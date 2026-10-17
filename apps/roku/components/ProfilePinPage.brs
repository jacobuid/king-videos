sub init()
    m.keyboard = m.top.findNode("keyboard")
    m.keyboard.observeField("text", "onPinChanged")
    m.busy = false
    m.top.findNode("title").font.size = 46
    m.top.findNode("subtitle").font.size = 25
    m.top.findNode("message").font.size = 24
    m.top.findNode("hint").font.size = 22
    renderBoxes()
end sub

sub updateTitle()
    m.top.findNode("title").text = "Enter your PIN to access " + m.top.profileName + "."
end sub

sub activate()
    m.busy = false
    m.keyboard.text = ""
    m.top.submittedPin = ""
    m.keyboard.keyGrid.focusVisible = true
    m.keyboard.setFocus(true)
    renderBoxes()
end sub

sub clearPin()
    m.keyboard.text = ""
    m.top.submittedPin = ""
end sub

sub renderBoxes()
    group = m.top.findNode("boxes")
    group.removeChildrenIndex(group.getChildCount(), 0)
    count = len(m.keyboard.text)
    for i = 0 to 3
        border = group.createChild("Rectangle")
        border.translation = [564 + i * 204,420]
        border.width = 180
        border.height = 180
        border.color = "#666666"
        if i = count and not m.busy then border.color = "#ffffff"
        fill = group.createChild("Rectangle")
        fill.translation = [567 + i * 204,423]
        fill.width = 174
        fill.height = 174
        fill.color = "#090909"
        if i < count
            mask = group.createChild("Label")
            mask.translation = [564 + i * 204,420]
            mask.width = 180
            mask.height = 180
            mask.horizAlign = "center"
            mask.vertAlign = "center"
            mask.font.size = 64
            mask.text = chr(8226)
        end if
    end for
end sub

sub onPinChanged()
    if m.busy then return
    digits = CreateObject("roRegex", "[^0-9]", "").ReplaceAll(m.keyboard.text, "")
    digits = left(digits, 4)
    if digits <> m.keyboard.text
        m.keyboard.text = digits
        return
    end if
    renderBoxes()
    if len(digits) = 4
        m.busy = true
        m.keyboard.keyGrid.focusVisible = false
        m.keyboard.setFocus(false)
        m.top.setFocus(true)
        m.top.message = "Opening your profile..."
        m.top.submittedPin = digits
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not m.top.visible or not press then return false
    if key = "back"
        m.busy = true
        clearPin()
        m.top.cancelled = true
        return true
    end if
    if m.busy then return true
    return false
end function

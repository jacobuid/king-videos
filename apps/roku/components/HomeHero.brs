sub init()
    m.index = 0
    m.top.observeField("focusedChild", "renderButtons")
    m.top.findNode("eyebrow").font.size = 22
    m.top.findNode("title").font.size = 44
    m.top.findNode("metadata").font.size = 25
    m.top.findNode("description").font.size = 25
end sub

sub activate()
    m.top.setFocus(true)
    renderButtons()
end sub

sub renderItem()
    item = m.top.item
    if item = invalid then return
    m.top.findNode("art").uri = ""
    if item.thumbnailUrl <> invalid then m.top.findNode("art").uri = item.thumbnailUrl
    m.top.findNode("title").text = item.title
    m.top.findNode("description").text = ""
    if item.description <> invalid then m.top.findNode("description").text = item.description
    text = ""
    if item.year <> invalid then text = item.year.toStr()
    if item.durationSeconds <> invalid and item.durationSeconds > 0
        minutes = int(item.durationSeconds / 60)
        text += "  /  "
        if minutes >= 60 then text += int(minutes / 60).toStr() + "h "
        text += (minutes mod 60).toStr() + "m"
    end if
    if item.kind <> invalid and item.kind = "show" then text += "  /  TV Series"
    if item.rating <> invalid and item.rating <> "" then text += "  /  " + item.rating
    m.top.findNode("metadata").text = text
    renderButtons()
end sub

sub renderButtons()
    if m.top.item = invalid then return
    group = m.top.findNode("buttons")
    group.removeChildrenIndex(group.getChildCount(), 0)
    names = ["Play", "Details"]
    blocked = m.top.item.blocked <> invalid and m.top.item.blocked
    if blocked then names[0] = "Blocked"
    for i = 0 to 1
        x = 1100 + i * 250
        uri = "pkg:/images/search-nav-gold.png"
        color = "#080808"
        if i = 0 and blocked then uri = "pkg:/images/detail-blocked.png" : color = "#ffffff"
        if i = 1 then uri = "pkg:/images/search-nav.png" : color = "#ffffff"
        heroImage(group, uri, x, 390, 235, 74)
        if i = 1 or (m.top.hasFocus() and m.index = i) then heroImage(group, "pkg:/images/search-nav-focus.png", x - 3, 387, 241, 80)
        if i = 0
            uri = "pkg:/images/search-detail-play.png"
            if blocked then uri = "pkg:/images/search-detail-blocked.png"
            icon = heroImage(group, uri, x + 23, 412, 30, 30)
            icon.blendColor = color
        end if
        text = group.createChild("Label")
        text.translation = [x + 55,390]
        text.width = 165
        text.height = 74
        text.vertAlign = "center"
        text.horizAlign = "center"
        text.font.size = 28
        text.color = color
        text.text = names[i]
    end for
end sub

function heroImage(parent as object, uri as string, x as integer, y as integer, width as integer, height as integer) as object
    node = parent.createChild("Poster")
    node.uri = uri
    node.translation = [x,y]
    node.width = width
    node.height = height
    return node
end function

function onKeyEvent(key as string, press as boolean) as boolean
    if not m.top.visible or not press then return false
    if key = "down"
        m.top.shelvesRequested = true
    else if key = "left"
        if m.index = 0 then m.top.menuRequested = true else m.index = 0
    else if key = "right"
        m.index = 1
    else if key = "back"
        m.top.menuRequested = true
    else if key = "OK"
        if m.index = 0
            if m.top.item.blocked <> invalid and m.top.item.blocked then return true
            m.top.action = "play"
        else
            m.top.action = "details"
        end if
    else
        return false
    end if
    renderButtons()
    return true
end function

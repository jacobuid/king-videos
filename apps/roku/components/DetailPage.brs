sub init()
    m.index = 0
    m.top.observeField("focusedChild", "renderButtons")
    m.rows = m.top.findNode("similarRows")
    m.rows.observeField("rowItemSelected", "onSimilarSelected")
    m.rows.observeField("menuRequested", "onRowsMenuRequested")
    m.top.findNode("title").font.size = 48
    m.top.findNode("metadata").font.size = 26
    m.top.findNode("description").font.size = 25
    m.top.findNode("credits").font.size = 21
    m.top.findNode("notice").font.size = 19
end sub

sub onRowsMenuRequested()
    m.top.menuRequested = true
end sub

sub activate()
    m.index = 0
    m.top.setFocus(true)
    renderButtons()
end sub

sub renderItem()
    item = m.top.item
    if item = invalid then return
    m.top.findNode("title").text = item.title
    m.top.findNode("art").uri = ""
    if item.thumbnailUrl <> invalid then m.top.findNode("art").uri = item.thumbnailUrl
    meta = ""
    if item.year <> invalid then meta = item.year.toStr()
    if item.kind <> invalid and item.kind = "show"
        if meta <> "" then meta += "  /  "
        meta += "TV Series"
    else if item.durationSeconds <> invalid and item.durationSeconds > 0
        minutes = int(item.durationSeconds / 60)
        if meta <> "" then meta += "  /  "
        if minutes >= 60 then meta += int(minutes / 60).toStr() + "h "
        meta += (minutes mod 60).toStr() + "m"
    end if
    if item.rating <> invalid and item.rating <> "" then meta += "  /  " + item.rating
    if item.hasCaptions <> invalid and item.hasCaptions then meta += "  CC"
    m.top.findNode("metadata").text = meta
    m.top.findNode("description").text = ""
    if item.description <> invalid then m.top.findNode("description").text = item.description
    credits = ""
    for each key in ["director", "writers", "cast"]
        value = item[key]
        if value <> invalid
            if type(value) = "roArray" then value = value.join(", ")
            if type(value) = "String" or type(value) = "roString"
                if value <> "" then credits += key + ":  " + value + chr(10)
            end if
        end if
    end for
    m.top.findNode("credits").text = credits
    m.buttonY = 460
    if credits <> "" then m.buttonY = 560
    group = m.top.findNode("genres")
    group.removeChildrenIndex(group.getChildCount(), 0)
    x = 1125
    if item.genres <> invalid
        for each genre in item.genres
            width = int(len(genre) * 13 + 38)
            if x + width > 1850 then exit for
            detailImage(group, "pkg:/images/search-chip.png", x, 240, width, 46)
            detailLabel(group, genre, x, 240, width, 46, 22, "#dddddd")
            x += width + 12
        end for
    end if
    renderButtons()
end sub

function detailImage(parent as object, uri as string, x as integer, y as integer, width as integer, height as integer) as object
    node = parent.createChild("Poster")
    node.translation = [x,y]
    node.width = width
    node.height = height
    node.uri = uri
    return node
end function

sub detailLabel(parent as object, text as string, x as integer, y as integer, width as integer, height as integer, size as integer, color as string)
    node = parent.createChild("Label")
    node.translation = [x,y]
    node.width = width
    node.height = height
    node.font.size = size
    node.text = text
    node.vertAlign = "center"
    node.horizAlign = "center"
    node.color = color
end sub

sub renderButtons()
    item = m.top.item
    if item = invalid then return
    m.names = [m.top.playLabel, "Back"]
    m.actions = ["play", "back"]
    if m.top.playLabel = "Blocked" then m.actions[0] = "blocked"
    if item.kind <> invalid and item.kind = "show"
        m.names.push("Episodes")
        m.actions.push("episodes")
    else if item.category = "movie"
        name = "My List"
        if m.top.favorite then name = "In My List"
        m.names.push(name)
        m.actions.push("favorite")
    end if
    group = m.top.findNode("buttons")
    group.removeChildrenIndex(group.getChildCount(), 0)
    for i = 0 to m.names.count() - 1
        uri = "pkg:/images/search-nav.png"
        color = "#ffffff"
        if i = 0 then uri = "pkg:/images/search-nav-gold.png" : color = "#080808"
        if i = 0 and m.top.playLabel = "Blocked"
            uri = "pkg:/images/detail-blocked.png"
            color = "#ffffff"
        end if
        x = 1125 + i * 245
        detailImage(group, uri, x, m.buttonY, 230, 74)
        if i > 0 then detailImage(group, "pkg:/images/search-nav-focus.png", x, m.buttonY, 230, 74)
        if m.top.hasFocus() and m.index = i then detailImage(group, "pkg:/images/search-nav-focus.png", x - 3, m.buttonY - 3, 236, 80)
        iconName = m.actions[i]
        if iconName = "favorite"
            iconName = "plus"
            if m.top.favorite then iconName = "check"
        end if
        icon = detailImage(group, "pkg:/images/search-detail-" + iconName + ".png", x + 22, m.buttonY + 22, 30, 30)
        icon.blendColor = color
        detailLabel(group, m.names[i], x + 60, m.buttonY, 156, 74, 28, color)
    end for
end sub

sub onSimilarSelected()
    selected = m.rows.rowItemSelected
    m.top.selectedMedia = m.rows.content.getChild(selected[0]).getChild(selected[1]).media
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not m.top.visible or not press then return false
    if key = "back"
        m.top.backRequested = true
        return true
    end if
    if m.rows.hasFocus()
        if key = "up"
            m.top.setFocus(true)
            renderButtons()
            return true
        else if key = "left" and m.rows.rowItemFocused[1] = 0
            m.top.menuRequested = true
            return true
        end if
        return false
    end if
    if key = "OK"
        if m.actions[m.index] = "blocked" then return true
        m.top.action = m.actions[m.index]
    else if key = "left"
        if m.index = 0 then m.top.menuRequested = true else m.index--
    else if key = "right"
        if m.index < m.names.count() - 1 then m.index++
    else if key = "down"
        if m.rows.content <> invalid and m.rows.content.getChildCount() > 0 then m.rows.setFocus(true)
    else
        return false
    end if
    renderButtons()
    return true
end function

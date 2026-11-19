sub init()
    m.index = 0
    m.top.observeField("focusedChild", "renderButtons")
    m.actionFocus = m.top.findNode("buttons")
    m.actionFocus.observeField("focusedChild", "renderButtons")
    m.rows = m.top.findNode("similarRows")
    m.rows.observeField("rowItemSelected", "onSimilarSelected")
    m.rows.observeField("menuRequested", "onRowsMenuRequested")
    m.rows.observeField("topRequested", "activate")
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
    m.top.findNode("detailsBody").translation = [0,0]
    m.rows.translation = [375,m.shelfY]
    ' Transfer between sibling nodes, not back to the shelf's ancestor.
    focused = m.actionFocus.setFocus(true)
    print "KINGFLIX detail actions focused: "; focused; " hasFocus: "; m.actionFocus.hasFocus()
    renderButtons()
end sub

sub browseEpisodes()
    m.rows.setFocus(true)
end sub

sub restoreShelfFocus(position as object)
    m.rows.callFunc("activateAt", position)
end sub

sub selectEpisode(id as string)
    m.rows.callFunc("selectEpisode", id)
    activate()
end sub

sub renderItem()
    item = m.top.item
    if item = invalid then return
    configureDetailsLayout()
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
    m.buttonY = 515
    m.shelfY = 650
    if credits <> ""
        m.buttonY = 590
        m.shelfY = 690
    end if
    group = m.top.findNode("genres")
    group.removeChildrenIndex(group.getChildCount(), 0)
    x = m.infoX
    genreY = 225
    if item.genres <> invalid
        for each genre in item.genres
            width = int(len(genre) * 11 + 30)
            if x + width > m.infoX + m.infoWidth
                if genreY > 225 then exit for
                x = m.infoX
                genreY = 272
            end if
            detailImage(group, "pkg:/images/search-chip.png", x, genreY, width, 40)
            detailLabel(group, genre, x, genreY, width, 40, 20, "#dddddd")
            x += width + 12
        end for
    end if
    descriptionY = genreY + 56
    m.top.findNode("description").translation = [m.infoX,descriptionY]
    m.top.findNode("description").height = 497 - descriptionY
    renderButtons()
end sub

sub configureDetailsLayout()
    m.infoX = 1310
    m.infoWidth = 535
    artX = 375
    artWidth = 900
    artHeight = 506
    titleSize = 40
    textSize = 23
    descriptionY = 330
    creditsY = 500
    for each id in ["art", "artFrame"]
        node = m.top.findNode(id)
        node.translation = [artX,55]
        node.width = artWidth
        node.height = artHeight
    end for
    for each id in ["title", "metadata", "description", "credits"]
        node = m.top.findNode(id)
        node.width = m.infoWidth
    end for
    m.top.findNode("title").translation = [m.infoX,50]
    m.top.findNode("title").font.size = titleSize
    m.top.findNode("metadata").translation = [m.infoX,178]
    m.top.findNode("metadata").font.size = textSize
    m.top.findNode("description").translation = [m.infoX,descriptionY]
    m.top.findNode("description").font.size = textSize
    m.top.findNode("credits").translation = [m.infoX,creditsY]
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
    m.names = [m.top.playLabel]
    m.actions = ["play"]
    if m.top.playLabel = "Blocked" then m.actions[0] = "blocked"
    if not m.top.showSeasons and item.category = "movie"
        name = "My List"
        if m.top.favorite then name = "In My List"
        m.names.push(name)
        m.actions.push("favorite")
    end if
    group = m.top.findNode("buttons")
    group.removeChildrenIndex(group.getChildCount(), 0)
    for i = 0 to m.names.count() - 1
        uri = "pkg:/images/search-nav-outline-gold.png"
        color = "#f3cc57"
        if i = 0 then uri = "pkg:/images/search-nav-gold.png" : color = "#080808"
        if i = 0 and m.top.playLabel = "Blocked"
            uri = "pkg:/images/detail-blocked.png"
            color = "#ffffff"
        end if
        x = m.infoX + i * 245
        focused = m.actionFocus.hasFocus() and m.index = i
        if focused then uri = "pkg:/images/search-nav-active.png" : color = "#080808"
        detailImage(group, uri, x, m.buttonY, 230, 74)
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
            activate()
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
        if m.rows.content <> invalid and m.rows.content.getChildCount() > 0 then browseEpisodes()
    else
        return false
    end if
    renderButtons()
    return true
end function

sub init()
    m.keyboard = m.top.findNode("keyboard")
    m.keyboard.observeField("text", "onTextChanged")
    m.zone = "keyboard"
    m.index = 0
    m.cardOffset = 0
    m.matches = []
    m.genreNames = ["Action", "Comedy", "Family", "Kids", "Adventure", "Christmas", "Superhero", "Animation", "Drama", "Horror"]
    m.top.findNode("recentHeading").font.size = 30
    m.top.findNode("popularHeading").font.size = 30
    m.top.findNode("resultsHeading").font.size = 30
    m.top.findNode("hint").font.size = 19
    m.top.findNode("queryText").font.size = 28
    renderGenres()
    renderRecent()
end sub

function label(parent as object, text as string, x as integer, y as integer, width as integer, height as integer, size as integer) as object
    node = parent.createChild("Label")
    node.translation = [x, y]
    node.width = width
    node.height = height
    node.text = text
    node.font.size = size
    node.vertAlign = "center"
    return node
end function

function image(parent as object, uri as string, x as integer, y as integer, width as integer, height as integer) as object
    node = parent.createChild("Poster")
    node.uri = uri
    node.translation = [x, y]
    node.width = width
    node.height = height
    return node
end function

sub clearGroup(id as string)
    node = m.top.findNode(id)
    node.removeChildrenIndex(node.getChildCount(), 0)
end sub

sub activate()
    focusZone("keyboard")
end sub

sub onVisibilityChanged()
    if m.keyboard = invalid then return
    if not m.top.visible then m.keyboard.callFunc("setInputFocus", false)
end sub

sub setQuery()
    if m.keyboard.text <> m.top.query then m.keyboard.text = m.top.query
    field = m.top.findNode("queryText")
    field.text = m.top.query
    field.color = "#ffffff"
    if m.top.query = ""
        field.text = "Search for movies or shows..."
        field.color = "#a4a4a4"
    end if
    refreshResults()
end sub

sub onTextChanged()
    m.top.query = m.keyboard.text
end sub

sub renderRecent()
    clearGroup("recentItems")
    parent = m.top.findNode("recentItems")
    m.recent = m.top.recent
    if m.recent = invalid then m.recent = []
    if m.recent.count() = 0
        text = label(parent, "Your searches appear here", 390, 272, 285, 80, 21)
        text.color = "#888888"
        text.wrap = true
    end if
    for i = 0 to m.recent.count() - 1
        if i >= 4 then exit for
        uri = "pkg:/images/search-chip.png"
        if m.zone = "recent" and m.index = i then uri = "pkg:/images/search-chip-focus.png"
        image(parent, uri, 390, 270 + i * 54, 280, 43)
        label(parent, m.recent[i], 408, 270 + i * 54, 246, 43, 22)
    end for
end sub

sub renderGenres()
    clearGroup("genres")
    parent = m.top.findNode("genres")
    for i = 0 to m.genreNames.count() - 1
        uri = "pkg:/images/search-chip.png"
        if m.zone = "genres" and m.index = i then uri = "pkg:/images/search-chip-focus.png"
        image(parent, uri, 385 + i * 146, 585, 136, 46)
        text = label(parent, m.genreNames[i], 387 + i * 146, 585, 132, 46, 20)
        text.horizAlign = "center"
    end for
end sub

sub refreshResults()
    if m.keyboard = invalid then return
    m.matches = []
    term = lcase(m.top.query.trim())
    catalog = m.top.catalog
    if catalog = invalid then catalog = []
    for each item in catalog
        matched = term = "" or instr(1, lcase(item.title), term) > 0
        if item.searchText <> invalid and instr(1, lcase(item.searchText), term) > 0 then matched = true
        if item.genres <> invalid
            for each genre in item.genres
                if lcase(genre) = term then matched = true
                if term = "animation" and genre = "Cartoon" then matched = true
            end for
        end if
        if term = "kids" and item.minAge <> invalid and item.minAge <= 12 then matched = true
        if matched then m.matches.push(item)
    end for
    m.cardOffset = 0
    if m.zone = "cards" then m.index = 0
    heading = "Explore KINGFLIX"
    if term <> "" then heading = "Search Results (" + m.matches.count().toStr() + ")"
    m.top.findNode("resultsHeading").text = heading
    m.top.findNode("empty").visible = m.matches.count() = 0
    renderCards()
end sub

sub renderCards()
    clearGroup("cards")
    parent = m.top.findNode("cards")
    for i = 0 to 5
        index = m.cardOffset + i
        if index >= m.matches.count() then exit for
        item = m.matches[index]
        x = 390 + i * 244
        uri = "pkg:/images/search-card.png"
        if m.zone = "cards" and m.index = index then uri = "pkg:/images/search-card-focus.png"
        image(parent, uri, x, 710, 234, 265)
        if item.thumbnailUrl <> invalid
            art = image(parent, item.thumbnailUrl, x + 3, 713, 228, 128)
            art.loadDisplayMode = "scaleToFill"
        end if
        text = label(parent, item.title, x + 14, 849, 207, 70, 22)
        text.wrap = true
        text.maxLines = 2
        text.vertAlign = "top"
        meta = ""
        if item.year <> invalid then meta = item.year.toStr()
        if item.durationSeconds <> invalid and item.durationSeconds > 0
            mins = int(item.durationSeconds / 60)
            runtime = mins.toStr() + "m"
            if mins >= 60 then runtime = int(mins / 60).toStr() + "h " + (mins mod 60).toStr() + "m"
            if meta <> "" then meta += " / "
            meta += runtime
        end if
        if item.kind <> invalid and item.kind = "show" then meta = "TV Series"
        text = label(parent, meta, x + 14, 931, 148, 28, 17)
        text.color = "#bfbfbf"
        if item.rating <> invalid and item.rating <> ""
            image(parent, "pkg:/images/search-chip.png", x + 166, 932, 57, 26)
            text = label(parent, item.rating, x + 166, 932, 57, 26, 16)
            text.horizAlign = "center"
        end if
    end for
end sub

sub focusZone(zone as string, index = 0 as integer)
    m.zone = zone
    m.index = index
    m.keyboard.callFunc("setInputFocus", zone = "keyboard")
    if zone <> "keyboard" then m.top.setFocus(true)
    if zone = "sidebar" then m.top.menuRequested = true
    renderRecent()
    renderGenres()
    renderCards()
end sub

sub rememberQuery()
    term = m.top.query.trim()
    if term <> "" then m.top.submittedQuery = term
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back"
        if m.zone = "sidebar"
            m.top.navigation = "Home"
        else
            focusZone("sidebar")
        end if
        return true
    end if
    if m.zone = "keyboard"
        ' Unhandled boundary arrows bubble up from the embedded key grid.
        if key = "left"
            if m.recent.count() > 0 then focusZone("recent") else focusZone("sidebar")
        else if key = "down"
            rememberQuery()
            focusZone("genres")
        else if key = "up"
            ' Keep focus on the visible grid; the hidden input still receives phone typing.
            return true
        else
            return false
        end if
        return true
    end if
    if key = "OK"
        if m.zone = "recent"
            m.top.query = m.recent[m.index]
            rememberQuery()
            focusZone("keyboard")
        else if m.zone = "genres"
            m.top.query = m.genreNames[m.index]
            rememberQuery()
            if m.matches.count() > 0 then focusZone("cards")
        else if m.zone = "cards" and m.matches.count() > 0
            rememberQuery()
            m.top.selectedMedia = m.matches[m.index]
        end if
        return true
    end if
    if m.zone = "recent"
        if key = "up" then m.index = (m.index + m.recent.count() - 1) mod m.recent.count()
        if key = "down" then m.index = (m.index + 1) mod m.recent.count()
        if key = "right" then focusZone("keyboard") : return true
        if key = "left" then focusZone("sidebar") : return true
    else if m.zone = "genres"
        if key = "up" then focusZone("keyboard") : return true
        if key = "down" and m.matches.count() > 0 then focusZone("cards") : return true
        if key = "left" and m.index = 0 then focusZone("sidebar") : return true
        if key = "left" then m.index = m.index - 1
        if key = "right" then m.index = (m.index + 1) mod m.genreNames.count()
    else if m.zone = "cards"
        if key = "up" then focusZone("genres") : return true
        if key = "left" and m.index = 0 then focusZone("sidebar") : return true
        if key = "left" then m.index = m.index - 1
        if key = "right" and m.index < m.matches.count() - 1 then m.index = m.index + 1
        if m.index < m.cardOffset then m.cardOffset = m.index
        if m.index >= m.cardOffset + 6 then m.cardOffset = m.index - 5
    else
        return false
    end if
    renderRecent()
    renderGenres()
    renderCards()
    return true
end function

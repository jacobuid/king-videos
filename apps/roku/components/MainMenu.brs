sub init()
    m.index = 0
    m.top.observeField("focusedChild", "renderMenu")
    configureMenu()
end sub

sub configureMenu()
    m.titles = ["Home", "Search", "Home Videos", "Movies", "Shows", "Collections", "Profile", "Unlink Roku"]
    m.icons = ["vhs", "icon", "home-videos", "movies", "shows", "shows", "profile", "link"]
    if m.top.homeVideosOnly
        m.titles = ["Home Videos", "Search", "Profile", "Unlink Roku"]
        m.icons = ["home-videos", "icon", "profile", "link"]
    end if
    if not m.top.linked then m.titles[m.titles.count() - 1] = "Link Roku"
    m.index = 0
    active = m.top.activeTitle
    if active = "TV" then active = "Shows"
    for i = 0 to m.titles.count() - 1
        if m.titles[i] = active then m.index = i
    end for
    renderMenu()
end sub

sub renderMenu()
    if m.titles = invalid then return
    parent = m.top.findNode("items")
    parent.removeChildrenIndex(parent.getChildCount(), 0)
    active = m.top.activeTitle
    if active = "TV" then active = "Shows"
    for i = 0 to m.titles.count() - 1
        focused = m.top.hasFocus() and m.index = i
        selected = m.titles[i] = active
        uri = "pkg:/images/search-nav.png"
        if selected then uri = "pkg:/images/search-nav-active.png"
        if focused then uri = "pkg:/images/search-nav-gold.png"
        menuImage(parent, uri, 28, 235 + i * 88, 290, 76)
        icon = menuImage(parent, "pkg:/images/search-" + m.icons[i] + ".png", 51, 253 + i * 88, 40, 40)
        text = parent.createChild("Label")
        text.translation = [111, 237 + i * 88]
        text.width = 198
        text.height = 72
        text.vertAlign = "center"
        text.font.size = 26
        text.text = m.titles[i]
        if focused or selected
            text.color = "#080808"
            icon.blendColor = "#080808"
        end if
        if focused then menuImage(parent, "pkg:/images/search-nav-focus.png", 28, 235 + i * 88, 290, 76)
    end for
end sub

function menuImage(parent as object, uri as string, x as integer, y as integer, width as integer, height as integer) as object
    node = parent.createChild("Poster")
    node.uri = uri
    node.translation = [x, y]
    node.width = width
    node.height = height
    return node
end function

function onKeyEvent(key as string, press as boolean) as boolean
    if not m.top.visible then return false
    if not press then return false
    if key = "up"
        m.index = (m.index + m.titles.count() - 1) mod m.titles.count()
    else if key = "down"
        m.index = (m.index + 1) mod m.titles.count()
    else if key = "OK"
        m.top.selectedTitle = m.titles[m.index]
        return true
    else if key = "right" or key = "back"
        m.top.exitRequested = true
        return true
    else
        return false
    end if
    renderMenu()
    return true
end function

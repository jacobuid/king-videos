sub init()
    m.grid = m.top.findNode("grid")
    m.grid.observeField("itemFocused", "updatePreview")
    m.grid.observeField("itemSelected", "selectItem")
    m.grid.observeField("menuRequested", "onGridMenuRequested")
    m.top.findNode("previewTitle").font.size = 44
    m.top.findNode("previewDescription").font.size = 26
    m.top.findNode("previewMetadata").font.size = 26
end sub

sub onGridMenuRequested()
    m.top.menuRequested = true
end sub

sub activate(index = -1 as integer)
    content = m.grid.content
    count = 0
    if content <> invalid then count = content.getChildCount()
    m.top.findNode("empty").visible = count = 0
    if count = 0
        m.top.findNode("previewArt").uri = ""
        m.top.findNode("previewTitle").text = ""
        m.top.findNode("previewDescription").text = ""
        m.top.findNode("previewMetadata").text = ""
        m.top.menuRequested = true
        return
    end if
    if index < 0 then index = m.top.focusedIndex
    if index >= count then index = count - 1
    m.top.focusedIndex = index
    m.grid.jumpToItem = index
    m.grid.setFocus(true)
    renderPreview(index)
end sub

sub updatePreview()
    m.top.focusedIndex = m.grid.itemFocused
    renderPreview(m.grid.itemFocused)
end sub

sub renderPreview(index as integer)
    if m.grid.content = invalid then return
    if index < 0 or index >= m.grid.content.getChildCount() then return
    item = m.grid.content.getChild(index).media
    m.top.findNode("previewArt").uri = ""
    if item.thumbnailUrl <> invalid then m.top.findNode("previewArt").uri = item.thumbnailUrl
    m.top.findNode("previewTitle").text = item.title
    description = ""
    if item.description <> invalid then description = item.description
    m.top.findNode("previewDescription").text = description
    metadata = ""
    if item.year <> invalid then metadata = item.year.toStr()
    if item.kind <> invalid and item.kind = "show"
        metadata += "  /  TV Series"
    else if item.durationSeconds <> invalid and item.durationSeconds > 0
        minutes = int(item.durationSeconds / 60)
        metadata += "  /  "
        if minutes >= 60 then metadata += int(minutes / 60).toStr() + "h "
        metadata += (minutes mod 60).toStr() + "m"
    end if
    if item.rating <> invalid and item.rating <> "" then metadata += "  /  " + item.rating
    if item.blocked <> invalid and item.blocked then metadata += "  /  Blocked"
    m.top.findNode("previewMetadata").text = metadata
end sub

sub selectItem()
    m.top.selectedMedia = m.grid.content.getChild(m.grid.itemSelected).media
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not m.top.visible or not press then return false
    if key = "back" or (key = "left" and m.grid.itemFocused mod 4 = 0)
        m.top.menuRequested = true
        return true
    end if
    return false
end function

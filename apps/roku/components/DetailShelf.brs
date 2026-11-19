sub init()
    m.rowIndex = 0
    m.index = 0
    m.offset = 0
    m.selections = {}
    m.top.observeField("focusedChild", "renderShelf")
end sub

sub selectEpisode(id as string)
    if m.top.content = invalid then return
    for r = 0 to m.top.content.getChildCount()-1
        row = m.top.content.getChild(r)
        for i = 0 to row.getChildCount()-1
            if row.getChild(i).media.id = id
                m.rowIndex = r
                m.index = i
                m.offset = 0
                updateSelection()
                return
            end if
        end for
    end for
end sub

sub resetContent()
    m.rowIndex = 0
    m.index = 0
    m.offset = 0
    m.selections = {}
    m.top.rowItemFocused = [0,0]
    renderShelf()
end sub

sub activateAt(position as object)
    m.rowIndex = position[0]
    m.index = position[1]
    if m.top.content = invalid then return
    if m.rowIndex >= m.top.content.getChildCount() then m.rowIndex = 0
    row = shelfRow()
    if row = invalid then return
    if m.index >= row.getChildCount() then m.index = 0
    m.offset = 0
    updateSelection()
    m.top.setFocus(true)
    renderShelf()
end sub

function shelfRow() as dynamic
    if m.top.content = invalid then return invalid
    return m.top.content.getChild(m.rowIndex)
end function

sub updateSelection()
    if m.index < m.offset then m.offset = m.index
    if m.index > m.offset + 5 then m.offset = m.index - 5
    m.selections[m.rowIndex.toStr()] = {index:m.index, offset:m.offset}
    m.top.rowItemFocused = [m.rowIndex,m.index]
    renderShelf()
end sub

sub changeRow(target as integer)
    m.rowIndex = target
    m.index = 0
    m.offset = 0
    saved = m.selections[target.toStr()]
    if saved <> invalid
        m.index = saved.index
        m.offset = saved.offset
    end if
    updateSelection()
end sub

sub renderShelf()
    parent = m.top.findNode("shelves")
    parent.removeChildrenIndex(parent.getChildCount(),0)
    if m.top.content = invalid then return
    first = m.rowIndex
    last = first
    if last >= m.top.content.getChildCount() then last = m.top.content.getChildCount() - 1
    for r = first to last
        row = m.top.content.getChild(r)
        y = (r - first) * 335
        heading = parent.createChild("Label")
        heading.translation = [0,y]
        heading.width = 1460
        heading.height = 42
        heading.font.size = 26
        heading.text = row.title
        offset = 0
        saved = m.selections[r.toStr()]
        if saved <> invalid then offset = saved.offset
        if r = m.rowIndex then offset = m.offset
        lastCard = offset + 5
        if lastCard >= row.getChildCount() then lastCard = row.getChildCount() - 1
        for i = offset to lastCard
            tile = parent.createChild("DetailTile")
            tile.translation = [(i-offset)*244,y+50]
            tile.itemContent = row.getChild(i)
            if m.top.hasFocus() and r = m.rowIndex and i = m.index then tile.focusPercent = 1
        end for
    end for
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "up"
        if m.rowIndex = 0 then m.top.topRequested = true else changeRow(m.rowIndex-1)
        return true
    end if
    row = shelfRow()
    if row = invalid then return false
    if key = "left"
        if m.index = 0
            m.top.menuRequested = true
            return true
        end if
        m.index--
    else if key = "right"
        if m.index < row.getChildCount()-1 then m.index++
    else if key = "OK"
        if row.getChildCount()>0 then m.top.rowItemSelected = [m.rowIndex,m.index]
        return true
    else if key = "down"
        if m.rowIndex+1 < m.top.content.getChildCount() then changeRow(m.rowIndex+1)
        return true
    else
        return false
    end if
    updateSelection()
    return true
end function

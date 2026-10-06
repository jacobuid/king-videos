sub updateContent()
    item = m.top.itemContent
    if item = invalid then return
    m.top.findNode("title").text = item.title
    m.top.findNode("art").uri = item.hdPosterUrl
end sub
sub updateFocus()
    color = "#3c3c3c"
    if m.top.focusPercent > 0.5 then color = "#e50914"
    m.top.findNode("border").color = color
end sub

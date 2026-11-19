sub updateContent()
    if m.top.itemContent = invalid then return
    m.top.findNode("art").uri = m.top.itemContent.hdPosterUrl
end sub

sub updateFocus()
    uri = "pkg:/images/collection-card.png"
    if m.top.focusPercent > 0.5 then uri = "pkg:/images/collection-card-focus.png"
    m.top.findNode("border").uri = uri
end sub

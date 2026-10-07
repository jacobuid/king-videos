sub init()
    initializeFonts()
end sub

sub updateSelection()
    color = "#444444"
    textColor = "#888888"
    if m.top.selected
        color = "#ffffff"
        textColor = "#ffffff"
    end if
    m.top.findNode("outline").color = color
    m.top.findNode("name").color = textColor
end sub

sub initializeFonts()
    m.top.findNode("name").font.size = 28
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "left" and m.top.numColumns > 0
        if m.top.itemFocused mod m.top.numColumns = 0
            m.top.menuRequested = true
            return true
        end if
    end if
    return false
end function

function onKeyEvent(key as string, press as boolean) as boolean
    ' Handle the boundary on the list itself, before native list navigation can
    ' consume Left without forwarding it to the containing page.
    if press and key = "left"
        selected = m.top.rowItemFocused
        if selected <> invalid and selected.count() >= 2
            if selected[1] = 0
                m.top.menuRequested = true
                return true
            end if
        end if
    end if
    return false
end function

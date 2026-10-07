function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    direction = lcase(key)
    if direction = "back" or direction = "play" or direction = "ok" or direction = "pause" or direction = "playonly" or direction = "left" or direction = "right" or direction = "rewind" or direction = "fastforward" or direction = "replay" or direction = "up" or direction = "down"
        m.top.remoteKey = direction
        return true
    end if
    return false
end function

sub updateContent()
    item = m.top.itemContent
    if item = invalid then return
    m.top.findNode("title").text = item.title
    m.top.findNode("art").uri = item.hdPosterUrl
    media = item.media
    metadata = ""
    description = ""
    captions = false
    blocked = false
    if media <> invalid
        if media.year <> invalid then metadata = media.year.toStr()
        if media.durationSeconds <> invalid and media.durationSeconds > 0
            minutes = int(media.durationSeconds / 60)
            runtime = minutes.toStr() + "m"
            if minutes >= 60
                runtime = int(minutes / 60).toStr() + "h"
                if minutes mod 60 > 0 then runtime += " " + (minutes mod 60).toStr() + "m"
            end if
            if metadata <> "" then metadata += " ? "
            metadata += runtime
        end if
        if media.rating <> invalid and media.rating <> ""
            if metadata <> "" then metadata += "  "
            metadata += media.rating
        end if
        if media.description <> invalid then description = media.description
        if media.hasCaptions <> invalid then captions = media.hasCaptions
        if media.blocked <> invalid then blocked = media.blocked
    end if
    m.top.findNode("metadata").text = metadata
    m.top.findNode("description").text = description
    m.top.findNode("captions").visible = captions
    m.top.findNode("blocked").visible = blocked
end sub

sub updateFocus()
    color = "#3c3c3c"
    if m.top.focusPercent > 0.5 then color = "#ffffff"
    m.top.findNode("border").color = color
end sub

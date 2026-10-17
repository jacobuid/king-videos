sub init()
    initializeFonts()
end sub

sub updateContent()
    item = m.top.itemContent
    if item = invalid then return
    m.top.findNode("title").text = item.title
    m.top.findNode("art").uri = item.hdPosterUrl
    fraction = 0.0
    if item.watchedFraction <> invalid then fraction = item.watchedFraction
    m.top.findNode("progress").visible = fraction > 0
    m.top.findNode("progressFill").width = int(328 * fraction)
    media = item.media
    collection = false
    if media <> invalid then collection = media.kind <> invalid and media.kind = "collection"
    for each id in ["title", "shade", "divider", "metadata", "description"]
        m.top.findNode(id).visible = not collection
    end for
    if collection
        m.top.findNode("border").height = 188
        m.top.findNode("background").height = 184
        m.top.findNode("art").loadDisplayMode = "scaleToFit"
        m.top.findNode("progress").visible = false
    else
        m.top.findNode("border").height = 320
        m.top.findNode("background").height = 316
        m.top.findNode("art").loadDisplayMode = "scaleToFill"
    end if
    metadata = ""
    description = ""
    captions = false
    blocked = false
    if media <> invalid
        if media.year <> invalid then metadata = media.year.toStr()
        if media.kind <> invalid and media.kind = "show"
            if metadata <> "" then metadata += " / "
            metadata += "TV Series"
        end if
        if media.durationSeconds <> invalid and media.durationSeconds > 0
            minutes = int(media.durationSeconds / 60)
            runtime = minutes.toStr() + "m"
            if minutes >= 60
                runtime = int(minutes / 60).toStr() + "h"
                if minutes mod 60 > 0 then runtime += " " + (minutes mod 60).toStr() + "m"
            end if
            if metadata <> "" then metadata += " / "
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

sub initializeFonts()
    m.top.findNode("title").font.size = 22
    m.top.findNode("metadata").font.size = 18
    m.top.findNode("captions").font.size = 17
    m.top.findNode("description").font.size = 18
    m.top.findNode("sizedLabel1").font.size = 18
end sub

sub init()
    m.top.findNode("title").font.size = 22
    m.top.findNode("metadata").font.size = 17
    m.top.findNode("rating").font.size = 16
    m.top.findNode("sizedLabel1").font.size = 18
end sub

sub updateContent()
    item = m.top.itemContent
    if item = invalid then return
    m.top.findNode("title").text = item.title
    m.top.findNode("art").uri = item.hdPosterUrl
    fraction = 0.0
    if item.watchedFraction <> invalid then fraction = item.watchedFraction
    m.top.findNode("progress").visible = fraction > 0
    m.top.findNode("progressFill").width = int(228 * fraction)
    media = item.media
    metadata = ""
    rating = ""
    blocked = false
    if media <> invalid
        if media.year <> invalid then metadata = media.year.toStr()
        if media.durationSeconds <> invalid and media.durationSeconds > 0
            minutes = int(media.durationSeconds / 60)
            runtime = minutes.toStr() + "m"
            if minutes >= 60 then runtime = int(minutes / 60).toStr() + "h " + (minutes mod 60).toStr() + "m"
            if metadata <> "" then metadata += " / "
            metadata += runtime
        end if
        if media.kind <> invalid and media.kind = "show" then metadata = "TV Series"
        if media.rating <> invalid then rating = media.rating
        if media.blocked <> invalid then blocked = media.blocked
    end if
    m.top.findNode("metadata").text = metadata
    m.top.findNode("rating").text = rating
    m.top.findNode("ratingChip").visible = rating <> ""
    m.top.findNode("blocked").visible = blocked
end sub

sub updateFocus()
    uri = "pkg:/images/search-card.png"
    if m.top.focusPercent > 0.5 then uri = "pkg:/images/search-card-focus.png"
    m.top.findNode("border").uri = uri
end sub

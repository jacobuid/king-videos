sub showDetails(item as object)
    m.homeHero.visible = false
    m.catalogPage.visible = false
    m.screen = "details"
    m.detailItem = item
    m.status.text = ""
    m.detailPage.notice = ""
    m.rows.visible = false
    m.searchPage.visible = false
    m.actions.visible = false
    m.top.findNode("detailThumbnail").visible = false
    display = {}
    display.append(item)
    m.detailPlayItem = item
    isShow = item.kind <> invalid and item.kind = "show"
    if isShow
        episodes = m.groups[item.seriesId]
        first = episodes[0]
        for each key in ["year", "rating", "genres", "description", "hasCaptions", "minAge"]
            if display[key] = invalid then display[key] = first[key]
        end for
        m.detailPlayItem = first
        for each episode in episodes
            if not episode.blocked and not completed(episode)
                m.detailPlayItem = episode
                exit for
            end if
        end for
        for each mediaId in m.progressOrder
            found = false
            for i = 0 to episodes.count() - 1
                episode = episodes[i]
                if episode.id = mediaId and positionFor(mediaId) > 0
                    if not episode.blocked then m.detailPlayItem = episode
                    if completed(episode) or episode.blocked
                        for nextIndex = i + 1 to episodes.count() - 1
                            nextEpisode = episodes[nextIndex]
                            if not nextEpisode.blocked and not completed(nextEpisode)
                                m.detailPlayItem = nextEpisode
                                exit for
                            end if
                        end for
                    end if
                    found = true
                    exit for
                end if
            end for
            if found then exit for
        end for
    end if
    playLabel = "Play"
    if positionFor(m.detailPlayItem.id) > 0 then playLabel = "Continue"
    if m.detailPlayItem.blocked <> invalid and m.detailPlayItem.blocked then playLabel = "Blocked"
    m.detailPage.item = display
    m.detailPage.playLabel = playLabel
    m.detailPage.favorite = m.favorites[item.id] <> invalid
    content = CreateObject("roSGNode", "ContentNode")
    if not isShow and isTv(item)
        content = showEpisodeShelf(m.groups[item.seriesId], item.id)
        m.detailPage.similar = content
        m.detailPage.visible = true
        m.detailPage.callFunc("activate")
        return
    end if
    similar = []
    for each candidate in searchCatalog()
        candidateShow = candidate.kind <> invalid and candidate.kind = "show"
        if candidate.id = item.id or candidateShow <> isShow then continue for
        if not isShow and candidate.category <> item.category then continue for
        if candidate.blocked <> invalid and candidate.blocked then continue for
        overlap = false
        if display.genres <> invalid and candidate.genres <> invalid
            for each genre in display.genres
                if includes(candidate.genres, genre) then overlap = true
            end for
        end if
        if overlap and similar.count() < 30 then similar.push(candidate)
    end for
    if similar.count() > 0
        row = content.createChild("ContentNode")
        row.title = "Similar Movies"
        if isShow then row.title = "Similar Shows"
        if item.category = "home-videos" then row.title = "More Home Videos"
        for each candidate in similar
            child = row.createChild("ContentNode")
            child.title = candidate.title
            if candidate.thumbnailUrl <> invalid then child.hdPosterUrl = candidate.thumbnailUrl
            child.addFields({media: candidate, watchedFraction: watchedFraction(candidate)})
        end for
    end if
    m.detailPage.similar = content
    m.detailPage.visible = true
    m.detailPage.callFunc("activate")
end sub

function showEpisodeShelf(episodes as object, currentId as string) as object
    content = CreateObject("roSGNode", "ContentNode")
    if episodes.count() = 0 then return content
    currentIndex = -1
    for i = 0 to episodes.count() - 1
        if episodes[i].id = currentId
            currentIndex = i
            exit for
        end if
    end for
    if currentIndex < 0 then return content
    row = content.createChild("ContentNode")
    row.title = "Previous and Next Episodes"
    if currentIndex > 0 then addEpisodeShelfCard(row, episodes[currentIndex - 1], "Previous Episode")
    if currentIndex + 1 < episodes.count() then addEpisodeShelfCard(row, episodes[currentIndex + 1], "Next Episode")
    if row.getChildCount() = 0 then content.removeChild(row)
    return content
end function

sub addEpisodeShelfCard(row as object, episode as object, label as string)
    child = row.createChild("ContentNode")
    slot = ""
    if episode.seasonNumber <> invalid and episode.episodeNumber <> invalid then slot = "S" + episode.seasonNumber.toStr() + " E" + episode.episodeNumber.toStr() + " - "
    child.title = label + ": " + slot + episode.title
    if episode.thumbnailUrl <> invalid then child.hdPosterUrl = episode.thumbnailUrl
    child.addFields({media: episode, watchedFraction: watchedFraction(episode)})
end sub

sub onDetailAction(event as object)
    action = event.GetData()
    if action = "back"
        goBack()
    else if action = "play"
        startPlayback(m.detailPlayItem)
    else if action = "favorite"
        method = "POST"
        if m.favorites[m.detailItem.id] <> invalid
            method = "DELETE"
            m.favorites.delete(m.detailItem.id)
        else
            m.favorites[m.detailItem.id] = true
        end if
        m.detailPage.favorite = m.favorites[m.detailItem.id] <> invalid
        api("favorite-save", "/api/favorites", method, profileRequestBody(m.detailItem.id))
    else if action = "episodes"
        m.history.push({screen: "details", section: m.section, item: m.detailItem})
        m.detailPage.visible = false
        m.screen = "episodes"
        m.heading.text = m.detailItem.title
        showRows([{title: "Episodes", items: m.groups[m.detailItem.seriesId]}])
    end if
end sub

sub onSimilarMediaSelected(event as object)
    m.history.push({screen: "details", section: m.section, item: m.detailItem})
    showDetails(event.GetData())
end sub

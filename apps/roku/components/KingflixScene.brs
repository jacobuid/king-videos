sub init()
    initializeFonts()
    m.top.backgroundURI = ""
    m.top.backgroundColor = "#000000"
    m.config = ParseJson(ReadAsciiFile("pkg:/config.json"))
    m.registryQueue = []
    m.registryBusy = false
    m.deviceToken = ""
    m.profileToken = ""
    m.tasks = {}
    m.sequence = 0
    m.lastSaved = 0
    m.playbackPosition = 0
    m.media = []
    m.positions = {}
    m.favorites = {}
    m.groups = {}
    m.history = []
    m.menu = m.top.findNode("menu")
    m.rows = m.top.findNode("rows")
    m.pairing = m.top.findNode("pairing")
    m.pairStatus = m.top.findNode("pairStatus")
    m.status = m.top.findNode("status")
    m.status.observeField("text", "onStatusText")
    m.heading = m.top.findNode("heading")
    m.actions = m.top.findNode("actions")
    m.video = m.top.findNode("video")
    m.poll = m.top.findNode("poll")
    m.menu.observeField("itemSelected", "onMenuSelected")
    m.rows.observeField("rowItemSelected", "onItemSelected")
    m.rows.observeField("rowItemFocused", "onItemFocused")
    m.actions.observeField("buttonSelected", "onActionSelected")
    m.video.getHttpAgent().SetCertificatesFile("common:/certs/ca-bundle.crt")
    m.video.observeField("position", "onVideoPosition")
    m.video.observeField("state", "onVideoState")
    m.poll.observeField("fire", "onPoll")
    m.top.setFocus(true)
    registryOperation("load")
end sub

sub registryOperation(operation as string, key = "" as string, value = "" as string)
    if key = "profile"
        if operation = "write" then m.savedProfile = ParseJson(value) else m.savedProfile = invalid
    end if
    m.registryQueue.push({operation: operation, key: key, value: value})
    processRegistryQueue()
end sub

sub processRegistryQueue()
    if m.registryBusy or m.registryQueue.count() = 0 then return
    m.registryBusy = true
    input = m.registryQueue[0]
    m.registryQueue.delete(0)
    m.registryTask = CreateObject("roSGNode", "RegistryTask")
    m.registryTask.input = input
    m.registryTask.observeField("result", "onRegistryResult")
    m.registryTask.control = "RUN"
end sub

sub onRegistryResult(event as object)
    result = event.GetData()
    m.registryBusy = false
    if result.operation = "load"
        m.deviceToken = result.deviceToken
        m.savedProfile = ParseJson(result.profile)
        if m.deviceToken = "" then beginPairing() else loadProfiles()
    end if
    processRegistryQueue()
end sub

function nowMillis() as double
    date = CreateObject("roDateTime")
    return date.AsSeconds() * 1000.0#
end function

function escaped(value as string) as string
    return value.EncodeUriComponent()
end function

sub api(kind as string, path as string, method = "GET" as string, body = invalid as dynamic)
    m.sequence++
    tag = m.sequence.toStr()
    task = CreateObject("roSGNode", "ApiTask")
    task.input = { url: m.config.api + path, method: method, body: body, token: m.deviceToken, profileToken: m.profileToken, tag: tag, kind: kind }
    m.tasks[tag] = task
    task.observeField("result", "onApiResult")
    task.control = "RUN"
end sub

sub beginPairing()
    m.top.findNode("loadingArtwork").visible = false
    m.screen = "pairing"
    m.pairing.visible = true
    m.top.findNode("pairUrl").text = m.config.web.replace("https://", "")
    codeGroup = m.top.findNode("pairCode")
    codeGroup.removeChildrenIndex(codeGroup.getChildCount(), 0)
    m.status.height = 600
    m.menu.visible = false
    m.rows.visible = false
    m.actions.visible = false
    m.heading.text = "Welcome to KINGFLIX"
    m.status.text = "Preparing your TV code..."
    m.deviceToken = ""
    api("pair", "/api/roku/pair", "POST", {})
end sub

sub onPoll()
    if m.pollPending then return
    if nowMillis() >= m.pairExpires
        m.poll.control = "STOP"
        m.status.text = "Your code expired. Press OK for a new code."
        return
    end if
    m.pollPending = true
    api("poll", "/api/roku/pair/status", "POST", {token: m.deviceToken})
end sub

sub loadProfiles()
    m.top.findNode("loadingArtwork").visible = true
    m.pairing.visible = false
    m.screen = "loading"
    m.status.text = "Loading profiles..."
    api("profiles", "/api/profiles")
end sub

sub onApiResult(event as object)
    result = event.GetData()
    failedRequest = m.tasks[result.tag].input
    m.tasks.delete(result.tag)
    kind = result.kind
    if kind = "poll" then m.pollPending = false
    if result.error <> ""
        m.top.findNode("loadingArtwork").visible = false
        if result.status = 401
            registryOperation("delete", "deviceToken")
            registryOperation("delete", "profile")
            if m.video.visible then m.video.control = "STOP"
            m.video.visible = false
            beginPairing()
        else if result.status = 403 and kind <> "unlock" and (result.error = "Profile is locked." or result.error = "Unlock this profile first.")
            m.profileToken = ""
            registryOperation("delete", "profile")
            m.video.control = "STOP"
            m.video.visible = false
            showProfiles()
            m.status.text = "Profile access expired. Choose your profile and enter its PIN again."
        else
            m.retry = failedRequest
            m.status.text = result.error + " Press OK to retry."
            if kind = "unlock"
                m.retry = invalid
                showPin()
            end if
            if kind = "poll" then m.poll.control = "STOP"
        end if
        return
    end if
    m.retry = invalid
    data = result.data
    if kind = "pair"
        m.deviceToken = data.token
        m.pairExpires = data.expires
        m.pollPending = false
        showPairCode(data.code)
        m.status.text = "Scan the QR code to open KINGFLIX, sign in, and enter your TV code."
        m.poll.control = "START"
    else if kind = "poll"
        if data.status = "linked"
            m.poll.control = "STOP"
            registryOperation("write", "deviceToken", m.deviceToken)
            loadProfiles()
        else if data.status = "expired"
            m.poll.control = "STOP"
            m.status.text = "Your code expired. Press OK for a new code."
        end if
    else if kind = "profiles"
        m.profiles = data
        saved = m.savedProfile
        if saved <> invalid and saved.expires > nowMillis()
            for each profile in m.profiles
                if profile.id = saved.id
                    m.profile = profile
                    m.profileToken = saved.token
                    loadLibrary()
                    return
                end if
            end for
        end if
        showProfiles()
    else if kind = "unlock"
        m.profileToken = data.token
        registryOperation("write", "profile", FormatJson({id: m.profile.id, token: data.token, expires: data.expires}))
        loadLibrary()
    else if kind = "library"
        for each item in data
            m.media.push(item)
        end for
        if data.count() = 50
            fetchLibraryPage()
        else
            api("progress", "/api/progress?profileId=" + escaped(m.profile.id))
        end if
    else if kind = "progress"
        m.positions = {}
        for each position in data
            m.positions[position.mediaId] = position.positionSeconds
        end for
        api("favorites", "/api/favorites?profileId=" + escaped(m.profile.id))
    else if kind = "favorites"
        m.favorites = {}
        for each favorite in data
            m.favorites[favorite.mediaId] = true
        end for
        prepareGroups()
        buildMenu()
        if m.profile.homeVideosOnly then showSection("Home Videos") else showSection("Home")
    else if kind = "play"
        content = CreateObject("roSGNode", "ContentNode")
        content.title = m.playingItem.title
        content.url = data.url
        content.streamFormat = "mp4"
        content.playStart = positionFor(m.playingItem.id)
        content.addFields({programID: m.playingItem.id})
        if data.subtitleUrl <> invalid and data.subtitleUrl <> ""
            content.subtitleTracks = [{TrackName: data.subtitleUrl, Language: "eng", Description: "English"}]
        end if
        m.video.content = content
        m.video.visible = true
        m.video.setFocus(true)
        m.video.control = "PLAY"
        m.lastSaved = content.playStart
        m.playbackPosition = content.playStart
    else if kind = "signout"
        registryOperation("delete", "deviceToken")
        registryOperation("delete", "profile")
        beginPairing()
    else if kind = "favorite-save"
        showDetails(m.detailItem)
    end if
end sub

sub showProfiles()
    m.top.findNode("loadingArtwork").visible = false
    m.screen = "profiles"
    m.status.height = 100
    m.status.text = ""
    m.heading.visible = false
    m.menu.visible = false
    m.actions.visible = false
    m.rows.visible = false
    m.profileStage = m.top.findNode("profileStage")
    m.profileStage.visible = true
    grid = m.top.findNode("profileGrid")
    grid.removeChildrenIndex(grid.getChildCount(), 0)
    m.profileTiles = []
    count = m.profiles.count()
    rowCount = int((count + 3) / 4)
    if rowCount < 1 then rowCount = 1
    firstRow = count - (rowCount - 1) * 4
    row = 0
    column = 0
    rowSize = firstRow
    for each profile in m.profiles
        avatar = profile.avatar
        if avatar = invalid then avatar = "bluey--bluey.png"
        if m.config.legacyAvatars[avatar] <> invalid then avatar = m.config.legacyAvatars[avatar]
        tile = grid.createChild("ProfileTile")
        tile.translation = [(1920 - (rowSize * 270 - 40)) / 2 + column * 270, 280 + row * 320]
        tile.title = profile.name
        tile.uri = m.config.web + "profiles/" + escaped(avatar)
        m.profileTiles.push({node: tile, profile: profile, row: row, column: column, rowSize: rowSize})
        column = column + 1
        if column >= rowSize
            row = row + 1
            column = 0
            rowSize = 4
        end if
    end for
    m.profileIndex = 0
    updateProfileFocus()
    m.top.setFocus(true)
end sub

sub updateProfileFocus()
    for i = 0 to m.profileTiles.count() - 1
        m.profileTiles[i].node.selected = (i = m.profileIndex)
    end for
end sub

sub selectProfile()
    m.profile = m.profileTiles[m.profileIndex].profile
    if m.profile.hasPin then showPin() else api("unlock", "/api/profiles/" + escaped(m.profile.id) + "/unlock", "POST", {pin: ""})
end sub

function profileKey(key as string) as boolean
    count = m.profileTiles.count()
    if count = 0 then return false
    if key = "OK"
        selectProfile()
        return true
    end if
    direction = lcase(key)
    firstRow = count - (int((count + 3) / 4) - 1) * 4
    index = m.profileIndex
    if index < firstRow
        rowStart = 0
        rowSize = firstRow
        column = index
    else
        rowStart = firstRow + int((index - firstRow) / 4) * 4
        rowSize = 4
        column = index - rowStart
    end if
    nextIndex = index
    if direction = "left" and column > 0 then nextIndex = index - 1
    if direction = "right" and column < rowSize - 1 and index < count - 1 then nextIndex = index + 1
    if direction = "down"
        nextStart = rowStart + rowSize
        if nextStart < count then nextIndex = nextStart + column
        if nextIndex >= count then nextIndex = count - 1
    end if
    if direction = "up" and rowStart > 0
        if rowStart = firstRow
            nextIndex = column
            if nextIndex >= firstRow then nextIndex = firstRow - 1
        else
            nextIndex = index - 4
        end if
    end if
    if direction <> "left" and direction <> "right" and direction <> "up" and direction <> "down" then return false
    m.profileIndex = nextIndex
    updateProfileFocus()
    return true
end function

sub showPin()
    dialog = CreateObject("roSGNode", "StandardPinPadDialog")
    dialog.title = "Enter " + m.profile.name + "'s PIN"
    dialog.buttons = ["Unlock", "Cancel"]
    dialog.textEditBox.maxTextLength = 4
    dialog.observeField("buttonSelected", "onPinSelected")
    m.top.dialog = dialog
end sub

sub onPinSelected(event as object)
    dialog = m.top.dialog
    if event.GetData() = 0
        pin = dialog.pin
        if len(pin) <> 4 then return
        m.top.dialog = invalid
        m.status.text = "Opening your profile..."
        api("unlock", "/api/profiles/" + escaped(m.profile.id) + "/unlock", "POST", {pin: pin})
    else
        m.top.dialog = invalid
        m.top.setFocus(true)
    end if
end sub

sub loadLibrary()
    m.top.findNode("loadingArtwork").visible = true
    m.top.findNode("profileStage").visible = false
    m.heading.visible = true
    m.screen = "loading"
    m.heading.text = "KINGFLIX"
    m.status.text = "Loading your library..."
    m.rows.visible = false
    m.media = []
    fetchLibraryPage()
end sub

sub fetchLibraryPage()
    api("library", "/api/library?profileId=" + escaped(m.profile.id) + "&limit=50&offset=" + m.media.count().toStr())
end sub

sub prepareGroups()
    m.groups = {}
    for each item in m.media
        if isTv(item) and item.seriesId <> invalid and item.seriesId <> ""
            if m.groups[item.seriesId] = invalid then m.groups[item.seriesId] = []
            m.groups[item.seriesId].push(item)
        end if
    end for
    for each key in m.groups
        episodes = m.groups[key]
        ' Stable episode order, including transitions between seasons.
        for i = 1 to episodes.count() - 1
            current = episodes[i]
            j = i - 1
            while j >= 0
                if episodeOrder(episodes[j]) <= episodeOrder(current) then exit while
                episodes[j + 1] = episodes[j]
                j--
            end while
            episodes[j + 1] = current
        end for
    end for
end sub

function episodeOrder(item as object) as integer
    season = 0
    episode = 0
    if item.seasonNumber <> invalid then season = item.seasonNumber
    if item.episodeNumber <> invalid then episode = item.episodeNumber
    return season * 10000 + episode
end function

function isTv(item as object) as boolean
    return item.category = "tv" or item.category = "series" or item.category = "show"
end function

function positionFor(id as string) as integer
    if m.positions[id] = invalid then return 0
    return m.positions[id]
end function

function completed(item as object) as boolean
    if item.durationSeconds = invalid or item.durationSeconds <= 0 then return false
    return positionFor(item.id) >= item.durationSeconds * 0.98
end function

sub buildMenu()
    titles = ["Home", "Movies", "TV", "Series", "Home Videos", "Search", "Profiles", "Unlink Roku"]
    if m.profile.homeVideosOnly then titles = ["Home Videos", "Search", "Profiles", "Unlink Roku"]
    content = CreateObject("roSGNode", "ContentNode")
    for each title in titles
        content.createChild("ContentNode").title = title
    end for
    m.menu.content = content
    m.menu.visible = true
end sub

sub onMenuSelected()
    title = m.menu.content.getChild(m.menu.itemSelected).title
    m.history = []
    if title = "Profiles"
        registryOperation("delete", "profile")
        m.profileToken = ""
        showProfiles()
    else if title = "Unlink Roku"
        api("signout", "/api/roku/signout", "DELETE", {})
    else if title = "Search"
        showSearch()
    else
        showSection(title)
    end if
end sub

sub showSearch()
    dialog = CreateObject("roSGNode", "StandardKeyboardDialog")
    dialog.title = "Search KINGFLIX"
    dialog.buttons = ["Search", "Cancel"]
    if m.searchQuery <> invalid then dialog.text = m.searchQuery
    dialog.observeField("buttonSelected", "onSearchSelected")
    m.top.dialog = dialog
end sub

sub onSearchSelected(event as object)
    if event.GetData() = 0
        m.searchQuery = m.top.dialog.text
        m.top.dialog = invalid
        showSection("Search")
    else
        m.top.dialog = invalid
        m.menu.setFocus(true)
    end if
end sub

function showCards() as object
    cards = []
    seen = {}
    for each media in m.media
        id = media.seriesId
        if id = invalid or id = "" or m.groups[id] = invalid then continue for
        if seen[id] <> invalid then continue for
        seen[id] = true
        first = m.groups[id][0]
        card = {id: "series:" + id, title: first.seriesTitle, thumbnailUrl: first.thumbnailUrl, kind: "show", seriesId: id}
        if card.title = invalid then card.title = id
        cards.push(card)
    end for
    return cards
end function

sub showSection(title as string)
    m.top.findNode("loadingArtwork").visible = false
    m.screen = "browse"
    m.status.height = 100
    m.section = title
    m.heading.text = title
    m.status.text = ""
    m.actions.visible = false
    items = []
    rows = []
    shows = showCards()
    if title = "Home"
        continuing = []
        seen = {}
        movies = []
        for each item in m.media
            if item.category = "movie" then movies.push(item)
            if m.positions[item.id] <> invalid
                candidate = item
                if isTv(item) and completed(item) and m.groups[item.seriesId] <> invalid
                    candidate = invalid
                    found = false
                    for each episode in m.groups[item.seriesId]
                        if found and not completed(episode)
                            candidate = episode
                            exit for
                        end if
                        if episode.id = item.id then found = true
                    end for
                end if
                if candidate <> invalid
                    if seen[candidate.id] = invalid
                        continuing.push(candidate)
                        seen[candidate.id] = true
                    end if
                end if
            end if
        end for
        unwatched = []
        available = []
        for each movie in movies
            if not movie.blocked
                available.push(movie)
                if m.positions[movie.id] = invalid then unwatched.push(movie)
            end if
        end for
        choices = unwatched
        if choices.count() = 0 then choices = available
        if choices.count() > 0 then rows.push({title: "Featured Presentation", items: [choices[Rnd(choices.count()) - 1]]})
        rows.push({title: "Continue Watching", items: continuing, resume: true})
        favorites = []
        for each item in movies
            if m.favorites[item.id] <> invalid then favorites.push(item)
        end for
        for each item in shows
            if m.favorites[item.id] <> invalid then favorites.push(item)
        end for
        rows.push({title: "My List", items: favorites})
        rows.push({title: "Movies", items: movies})
        rows.push({title: "TV Shows", items: shows})
    else if title = "TV"
        items = shows
    else if title = "Series"
        for each collection in m.config.collections
            items.push({id: collection.id, title: collection.title, thumbnailUrl: m.config.web + collection.thumbnail, kind: "collection", collection: collection})
        end for
    else if title = "Search"
        term = lcase(m.searchQuery)
        for each item in m.media
            if not isTv(item) and (term = "" or instr(1, lcase(item.title), term) > 0) then items.push(item)
        end for
        for each item in shows
            matched = term = "" or instr(1, lcase(item.title), term) > 0
            if not matched
                for each episode in m.groups[item.seriesId]
                    if instr(1, lcase(episode.title), term) > 0 then matched = true
                end for
            end if
            if matched then items.push(item)
        end for
    else
        category = "movie"
        if title = "Home Videos" then category = "home-videos"
        for each item in m.media
            if item.category = category then items.push(item)
        end for
    end if
    if title = "Movies" or title = "TV"
        latest = []
        for each item in items
            if latest.count() = 10 then exit for
            latest.push(item)
        end for
        rows.push({title: "Latest Added", items: latest})
    end if
    if title <> "Home" then rows.push({title: title, items: items})
    showRows(rows)
end sub

sub showRows(rows as object)
    m.visibleRows = []
    content = CreateObject("roSGNode", "ContentNode")
    for each row in rows
        if row.items.count() > 0
            m.visibleRows.push(row)
            node = content.createChild("ContentNode")
            node.title = row.title
            for each item in row.items
                child = node.createChild("ContentNode")
                child.title = item.title
                if item.thumbnailUrl <> invalid then child.hdPosterUrl = item.thumbnailUrl
                child.addFields({media: item, watchedFraction: watchedFraction(item)})
            end for
        end if
    end for
    m.rows.content = content
    m.rows.visible = content.getChildCount() > 0
    if m.rows.visible then m.rows.setFocus(true) else m.menu.setFocus(true)
    if content.getChildCount() = 0 then m.status.text = "Nothing here yet."
end sub

sub onItemFocused()
    if m.screen <> "browse" and m.screen <> "episodes" then return
    selected = m.rows.rowItemFocused
    item = m.rows.content.getChild(selected[0]).getChild(selected[1]).media
    description = ""
    if item.rating <> invalid then description = item.rating + "  "
    if item.hasCaptions <> invalid and item.hasCaptions then description += "CC  "
    if item.description <> invalid then description += item.description
    m.status.text = left(description, 220)
end sub

sub onItemSelected()
    selected = m.rows.rowItemSelected
    item = m.rows.content.getChild(selected[0]).getChild(selected[1]).media
    if m.screen = "profiles"
        m.profile = item.profile
        if m.profile.hasPin
            showPin()
        else
            api("unlock", "/api/profiles/" + escaped(m.profile.id) + "/unlock", "POST", {pin: ""})
        end if
        return
    end if
    if m.visibleRows[selected[0]].resume <> invalid and m.visibleRows[selected[0]].resume
        startPlayback(item)
        return
    end if
    m.history.push({screen: m.screen, section: m.section, rows: m.visibleRows, focus: selected})
    if item.kind = "show"
        m.screen = "episodes"
        m.heading.text = item.title
        showRows([{title: "Episodes", items: m.groups[item.seriesId]}])
    else if item.kind = "collection"
        m.screen = "episodes"
        m.heading.text = item.title
        items = []
        for each media in m.media
            if not isTv(media) and includes(item.collection.mediaIds, media.id) then items.push(media)
        end for
        for each show in showCards()
            if includes(item.collection.showIds, show.seriesId) then items.push(show)
        end for
        showRows([{title: item.title, items: items}])
    else
        showDetails(item)
    end if
end sub

function includes(values as object, value as dynamic) as boolean
    for each entry in values
        if entry = value then return true
    end for
    return false
end function

sub showDetails(item as object)
    m.screen = "details"
    m.detailItem = item
    m.heading.text = item.title
    text = ""
    if item.year <> invalid then text += item.year.toStr() + "  "
    if item.rating <> invalid then text += item.rating + "  "
    if item.durationSeconds <> invalid then text += int(item.durationSeconds / 60).toStr() + " min  "
    if item.hasCaptions <> invalid and item.hasCaptions then text += "CC"
    if item.genres <> invalid then text += chr(10) + item.genres.join(" / ")
    if item.description <> invalid then text += chr(10) + item.description
    m.status.height = 420
    m.status.text = text
    m.rows.visible = false
    buttons = ["Watch", "Back"]
    if positionFor(item.id) > 0 then buttons[0] = "Continue"
    if item.blocked then buttons[0] = "Blocked"
    if item.category = "movie"
        label = "Add to My List"
        if m.favorites[item.id] <> invalid then label = "Remove from My List"
        buttons = [buttons[0], label, "Back"]
    end if
    m.actions.buttons = buttons
    m.actions.visible = true
    m.actions.setFocus(true)
end sub

sub onActionSelected()
    index = m.actions.buttonSelected
    if index = 0
        startPlayback(m.detailItem)
    else if index = 1 and m.detailItem.category = "movie"
        method = "POST"
        if m.favorites[m.detailItem.id] <> invalid
            method = "DELETE"
            m.favorites.delete(m.detailItem.id)
        else
            m.favorites[m.detailItem.id] = true
        end if
        api("favorite-save", "/api/favorites", method, profileRequestBody(m.detailItem.id))
    else
        goBack()
    end if
end sub

sub startPlayback(item as object)
    if item.blocked then return
    m.playingItem = item
    m.status.text = "Loading video..."
    api("play", "/api/media/" + escaped(item.id) + "/play", "POST", profileRequestBody())
end sub

sub savePosition()
    if m.playingItem = invalid then return
    position = int(m.playbackPosition)
    m.positions[m.playingItem.id] = position
    api("progress-save", "/api/progress", "POST", profileRequestBody(m.playingItem.id, position))
end sub

sub onVideoPosition()
    if not m.video.visible then return
    m.playbackPosition = m.video.position
    if abs(m.video.position - m.lastSaved) >= 15
        m.lastSaved = m.video.position
        savePosition()
    end if
end sub

sub onVideoState()
    state = m.video.state
    if state = "paused"
        m.playbackPosition = m.video.position
        savePosition()
    end if
    if state = "finished" and m.playingItem.durationSeconds <> invalid then m.playbackPosition = m.playingItem.durationSeconds
    if state = "finished" or state = "error" or state = "stopped"
        if not m.video.visible then return
        savePosition()
        m.video.visible = false
        if m.screen = "details" then showDetails(m.detailItem) else showSection(m.section)
        if state = "error" then m.status.text = "Video could not be played. Please try again."
    end if
end sub

sub goBack()
    m.status.height = 100
    m.actions.visible = false
    if m.history.count() > 0
        previous = m.history.pop()
        m.screen = previous.screen
        m.section = previous.section
        m.heading.text = previous.section
        showRows(previous.rows)
        m.rows.jumpToRowItem = previous.focus
    else
        if m.profile.homeVideosOnly then showSection("Home Videos") else showSection("Home")
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if m.video.visible
        if key = "back"
            m.playbackPosition = m.video.position
            savePosition()
            m.video.control = "STOP"
            return true
        end if
        return false
    end if
    if key = "OK" and m.retry <> invalid
        retry = m.retry
        m.retry = invalid
        api(retry.kind, mid(retry.url, len(m.config.api) + 1), retry.method, retry.body)
        return true
    end if
    if m.screen = "profiles" then return profileKey(key)
    if m.screen = "pairing" and key = "OK"
        m.poll.control = "STOP"
        beginPairing()
        return true
    end if
    if key = "back"
        if m.screen = "details" or m.screen = "episodes"
            goBack()
            return true
        else if m.screen = "browse" and not m.menu.hasFocus()
            m.menu.setFocus(true)
            return true
        end if
    else if key = "left" and m.rows.hasFocus()
        selected = m.rows.rowItemFocused
        if selected[1] = 0 and m.menu.visible
            m.menu.setFocus(true)
            return true
        end if
    else if key = "right" and m.menu.hasFocus() and m.rows.visible
        m.rows.setFocus(true)
        return true
    end if
    return false
end function

sub onStatusText()
    if m.pairing.visible then m.pairStatus.text = m.status.text
end sub

sub showPairCode(code as string)
    group = m.top.findNode("pairCode")
    group.removeChildrenIndex(group.getChildCount(), 0)
    for i = 0 to len(code) - 1
        codeBox = group.createChild("Poster")
        codeBox.translation = [i * 66, 0]
        codeBox.width = 64
        codeBox.height = 116
        codeBox.uri = "pkg:/images/code-codeBox.png"
        letter = group.createChild("Label")
        letter.translation = [i * 66, 0]
        letter.width = 64
        letter.height = 116
        letter.text = mid(code, i + 1, 1)
        letter.horizAlign = "center"
        letter.vertAlign = "center"
        letter.font = "font:LargeBoldSystemFont"
        letter.font.size = 48
    end for
end sub

' API JSON field names must retain their case. Literal/dot keys are lowercased by BrightScript.
function profileRequestBody(mediaId = invalid as dynamic, position = invalid as dynamic) as object
    body = {}
    body["profileId"] = m.profile.id
    if mediaId <> invalid then body["mediaId"] = mediaId
    if position <> invalid then body["positionSeconds"] = position
    return body
end function

sub initializeFonts()
    m.top.findNode("sizedLabel1").font.size = 76
    m.top.findNode("sizedLabel2").font.size = 64
    m.top.findNode("sizedLabel3").font.size = 64
    m.top.findNode("sizedLabel4").font.size = 64
    m.top.findNode("sizedLabel5").font.size = 36
    m.top.findNode("sizedLabel6").font.size = 22
    m.top.findNode("sizedLabel7").font.size = 36
    m.top.findNode("sizedLabel8").font.size = 22
    m.top.findNode("sizedLabel9").font.size = 36
    m.top.findNode("sizedLabel10").font.size = 22
    m.top.findNode("pairUrl").font.size = 24
    m.top.findNode("sizedLabel11").font.size = 44
    m.top.findNode("pairStatus").font.size = 26
end sub

function watchedFraction(item as object) as float
    duration = 0.0
    watched = 0.0
    items = [item]
    if item.kind <> invalid and item.kind = "show" and m.groups[item.seriesId] <> invalid then items = m.groups[item.seriesId]
    for each video in items
        if video.durationSeconds <> invalid and video.durationSeconds > 0
            duration += video.durationSeconds
            position = positionFor(video.id)
            if position > video.durationSeconds then position = video.durationSeconds
            if position > 0 then watched += position
        end if
    end for
    if duration <= 0 then return 0
    return watched / duration
end function

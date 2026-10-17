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
    m.progressRevision = 0
    m.progressSaving = false
    m.progressRefreshing = false
    m.pollPending = false
    m.pendingProgress = invalid
    m.retry = invalid
    m.playingItem = invalid
    m.playbackActivity = invalid
    m.screen = "loading"
    m.profileOpeningOk = false
    m.profileEpoch = 0
    m.profileBusy = false
    m.section = "Home"
    m.media = []
    m.progressOrder = []
    m.positions = {}
    m.favorites = {}
    m.groups = {}
    m.history = []
    m.searches = {}
    m.dailyFeatured = {}
    m.searchQuery = ""
    m.searchPage = m.top.findNode("searchPage")
    m.searchPage.observeField("selectedMedia", "onSearchMediaSelected")
    m.searchPage.observeField("navigation", "onSearchNavigation")
    m.searchPage.observeField("submittedQuery", "onSearchSubmitted")
    m.detailPage = m.top.findNode("detailPage")
    m.detailPage.observeField("action", "onDetailAction")
    m.detailPage.observeField("selectedMedia", "onSimilarMediaSelected")
    m.detailPage.observeField("menuRequested", "onSearchMenuRequested")
    m.detailPage.observeField("backRequested", "goBack")
    m.catalogPage = m.top.findNode("catalogPage")
    m.catalogPage.observeField("selectedMedia", "onCatalogSelected")
    m.catalogPage.observeField("menuRequested", "onSearchMenuRequested")
    m.homeHero = m.top.findNode("homeHero")
    m.homeHero.observeField("action", "onHomeHeroAction")
    m.homeHero.observeField("menuRequested", "onSearchMenuRequested")
    m.homeHero.observeField("shelvesRequested", "onHomeShelvesRequested")
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
    m.menu.observeField("selectedTitle", "onMenuSelected")
    m.menu.observeField("exitRequested", "onMenuExit")
    m.searchPage.observeField("menuRequested", "onSearchMenuRequested")
    m.rows.observeField("rowItemSelected", "onItemSelected")
    m.rows.observeField("rowItemFocused", "onItemFocused")
    m.rows.observeField("menuRequested", "onSearchMenuRequested")
    m.actions.observeField("buttonSelected", "onActionSelected")
    m.video.getHttpAgent().SetCertificatesFile("common:/certs/ca-bundle.crt")
    m.video.observeField("position", "onVideoPosition")
    m.video.observeField("state", "onVideoState")
    m.poll.observeField("fire", "onPoll")
    m.top.findNode("playbackWatchdog").observeField("fire", "checkPlaybackStall")
    m.top.findNode("progressTimer").observeField("fire", "refreshHomeProgress")
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
        savedSearches = ParseJson(result.searches)
        if type(savedSearches) = "roAssociativeArray" then m.searches = savedSearches
        savedFeatured = ParseJson(result.featured)
        if type(savedFeatured) = "roAssociativeArray" then m.dailyFeatured = savedFeatured
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
    task.input = { url: m.config.api + path, method: method, body: body, token: m.deviceToken, profileToken: m.profileToken, profileEpoch: m.profileEpoch, progressRevision: m.progressRevision, tag: tag, kind: kind }
    m.tasks[tag] = task
    task.observeField("result", "onApiResult")
    task.control = "RUN"
end sub

sub beginPairing()
    m.homeHero.visible = false
    m.catalogPage.visible = false
    m.detailPage.visible = false
    m.searchPage.visible = false
    m.top.findNode("detailThumbnail").visible = false
    m.status.width = 1430
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
    profileRequest = includes(["unlock", "library", "progress", "favorites", "play", "favorite-save", "progress-save", "progress-refresh"], kind)
    if profileRequest and failedRequest.profileEpoch <> m.profileEpoch then return
    if kind = "unlock" then m.profileBusy = false
    if kind = "poll" then m.pollPending = false
    if kind = "progress-refresh" then m.progressRefreshing = false
    if kind = "progress-save" then m.progressSaving = false
    if (kind = "progress-save" or kind = "progress-refresh") and failedRequest.profileToken <> m.profileToken then return
    if result.error <> ""
        print "KINGFLIX request failed: "; kind; " HTTP "; result.status; " "; result.error
        if kind = "progress-save" and result.status <> 401 and result.status <> 403
            if m.pendingProgress = invalid then m.pendingProgress = failedRequest.body
            return
        end if
        m.top.findNode("loadingArtwork").visible = false
        if result.status = 401
            registryOperation("delete", "deviceToken")
            registryOperation("delete", "profile")
            if m.video.visible then m.video.control = "stop"
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
        m.progressOrder = []
    m.positions = {}
        for each position in data
            m.positions[position.mediaId] = position.positionSeconds
            m.progressOrder.push(position.mediaId)
        end for
        api("favorites", "/api/favorites?profileId=" + escaped(m.profile.id))
    else if kind = "progress-refresh"
        if failedRequest.profileToken <> m.profileToken or m.progressSaving or failedRequest.progressRevision <> m.progressRevision then return
        m.positions = {}
        m.progressOrder = []
        for each position in data
            m.positions[position.mediaId] = position.positionSeconds
            m.progressOrder.push(position.mediaId)
        end for
        if m.screen = "browse" and m.section = "Home" and not m.video.visible
            focused = m.rows.rowItemFocused
            menuFocused = m.menu.hasFocus()
            shelvesFocused = m.rows.hasFocus()
            heroItem = m.homeHero.item
            oldFeaturedId = ""
            if m.homeFeatured <> invalid then oldFeaturedId = m.homeFeatured.id
            showSection("Home")
            if focused <> invalid then m.rows.jumpToRowItem = focused
            if shelvesFocused
                m.rows.setFocus(true)
                updateHomeHero()
            else if heroItem <> invalid
                if heroItem.id <> oldFeaturedId then m.homeHero.item = heroItem
            end if
            if menuFocused then m.menu.setFocus(true)
        end if
    else if kind = "progress-save"
        sendPendingProgress()
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
        m.video.enableUI = true
        m.video.enableTrickPlay = true
        m.playbackActivity = CreateObject("roTimespan")
        m.playbackActivity.Mark()
        m.top.findNode("playbackWatchdog").control = "START"
        print "KINGFLIX playback started: "; m.playingItem.id
        m.video.control = "play"
        m.lastSaved = content.playStart
        m.playbackPosition = content.playStart
    else if kind = "signout"
        registryOperation("delete", "deviceToken")
        registryOperation("delete", "profile")
        beginPairing()
    else if kind = "favorite-save"
        if m.screen = "details" then m.detailPage.favorite = m.favorites[m.detailItem.id] <> invalid
    end if
end sub

sub showProfiles()
    m.homeFeatured = invalid
    m.homeHero.visible = false
    m.catalogPage.visible = false
    m.detailPage.visible = false
    m.profileEpoch++
    m.profileBusy = false
    m.progressSaving = false
    m.progressRefreshing = false
    ' Hiding a node does not transfer its remote focus. Focus the picker itself,
    ' not the Scene, which is already an ancestor of the focused menu/keyboard.
    m.menu.setFocus(false)
    m.searchPage.visible = false
    m.searchQuery = ""
    m.top.findNode("detailThumbnail").visible = false
    m.status.width = 1430
    m.pendingProgress = invalid
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
    m.profileStage.setFocus(true)
    print "KINGFLIX profile picker focus: "; m.profileStage.hasFocus(); " menu: "; m.menu.hasFocus()
end sub

sub updateProfileFocus()
    for i = 0 to m.profileTiles.count() - 1
        m.profileTiles[i].node.selected = (i = m.profileIndex)
    end for
end sub

sub selectProfile()
    if m.profileBusy then return
    m.profileOpeningOk = false
    m.profile = m.profileTiles[m.profileIndex].profile
    if m.profile.hasPin
        showPin()
    else
        m.profileBusy = true
        api("unlock", "/api/profiles/" + escaped(m.profile.id) + "/unlock", "POST", {pin: ""})
    end if
end sub

function profileKey(key as string) as boolean
    if m.profileBusy then return true
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
        m.profileBusy = true
        api("unlock", "/api/profiles/" + escaped(m.profile.id) + "/unlock", "POST", {pin: pin})
    else
        m.top.dialog = invalid
        m.profileStage.setFocus(true)
    end if
end sub

sub loadLibrary()
    m.homeHero.visible = false
    m.catalogPage.visible = false
    m.detailPage.visible = false
    m.menu.visible = false
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
    m.menu.homeVideosOnly = m.profile.homeVideosOnly
    m.menu.linked = m.deviceToken <> ""
    m.menu.visible = true
end sub

sub onSearchMenuRequested()
    m.menu.setFocus(true)
end sub

sub onMenuExit()
    if m.screen = "search"
        m.searchPage.callFunc("activate")
    else if m.screen = "catalog"
        m.catalogPage.callFunc("activate")
    else if m.screen = "details"
        m.detailPage.callFunc("activate")
    else if m.rows.visible
        m.rows.setFocus(true)
    end if
end sub

sub switchProfile()
    ' Require the opening OK to be released before selecting a profile.
    m.profileOpeningOk = true
    m.history = []
    m.retry = invalid
    m.detailItem = invalid
    m.top.findNode("progressTimer").control = "STOP"
    registryOperation("delete", "profile")
    m.profileToken = ""
    showProfiles()
end sub

sub onMenuSelected()
    if m.screen = "search" then m.searchQuery = m.searchPage.query
    title = m.menu.selectedTitle
    if title = "Shows" then title = "TV"
    m.history = []
    if title = "Switch Profile" or title = "Profile"
        switchProfile()
    else if title = "Unlink Roku"
        api("signout", "/api/roku/signout", "DELETE", {})
    else if title = "Link Roku"
        beginPairing()
    else if title = "Search"
        showSearch()
    else
        showSection(title)
        if title = "Home" then refreshHomeProgress()
    end if
end sub

sub showSearch()
    m.homeHero.visible = false
    m.catalogPage.visible = false
    m.detailPage.visible = false
    m.screen = "search"
    m.section = "Search"
    m.menu.activeTitle = "Search"
    m.menu.visible = true
    m.top.findNode("detailThumbnail").visible = false
    m.actions.visible = false
    m.rows.visible = false
    m.searchPage.catalog = searchCatalog()
    recent = m.searches[m.profile.id]
    if recent = invalid then recent = []
    m.searchPage.recent = recent
    m.searchPage.query = m.searchQuery
    m.searchPage.visible = true
    m.searchPage.callFunc("activate")
end sub

sub onSearchSubmitted(event as object)
    term = event.GetData()
    recent = [term]
    previous = m.searches[m.profile.id]
    if previous <> invalid
        for each entry in previous
            if lcase(entry) <> lcase(term) and recent.count() < 4 then recent.push(entry)
        end for
    end if
    m.searches[m.profile.id] = recent
    m.searchPage.recent = recent
    registryOperation("write", "searches", FormatJson(m.searches))
end sub

sub onSearchNavigation(event as object)
    title = event.GetData()
    m.searchQuery = m.searchPage.query
    m.searchPage.visible = false
    if title = "Unlink Roku"
        api("signout", "/api/roku/signout", "DELETE", {})
    else if title = "Link Roku"
        beginPairing()
    else if title = "Profile"
        switchProfile()
    else
        if title = "Shows" then title = "TV"
        if m.profile.homeVideosOnly and title <> "Search" and title <> "My List" then title = "Home Videos"
        showSection(title)
    end if
end sub

sub onSearchMediaSelected(event as object)
    item = event.GetData()
    m.searchQuery = m.searchPage.query
    m.searchPage.visible = false
    m.history.push({screen: "search", section: "Search"})
    if item.kind <> invalid and item.kind = "show"
        showDetails(item)
    else
        showDetails(item)
    end if
end sub

function searchCatalog() as object
    items = []
    for each item in m.media
        if not isTv(item) then items.push(item)
    end for
    for each show in showCards()
        first = m.groups[show.seriesId][0]
        show.genres = first.genres
        show.rating = first.rating
        show.year = first.year
        show.minAge = first.minAge
        show.searchText = ""
        for each episode in m.groups[show.seriesId]
            show.searchText += " " + episode.title
        end for
        items.push(show)
    end for
    return items
end function

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
        for each key in ["year", "rating", "description", "genres", "minAge", "hasCaptions"]
            card[key] = first[key]
        end for
        if card.title = invalid then card.title = id
        cards.push(card)
    end for
    return cards
end function

sub showSection(title as string)
    m.homeHero.visible = false
    m.catalogPage.visible = false
    m.detailPage.visible = false
    if title = "Search" then showSearch() : return
    m.searchPage.visible = false
    m.menu.activeTitle = title
    m.menu.visible = true
    m.top.findNode("detailThumbnail").visible = false
    m.status.width = 1430
    m.top.findNode("loadingArtwork").visible = false
    m.screen = "browse"
    m.status.height = 100
    m.top.findNode("progressTimer").control = "START"
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
        for each media in m.media
            if media.category = "movie" then movies.push(media)
        end for
        for each mediaId in m.progressOrder
            item = invalid
            for each media in m.media
                if media.id = mediaId
                    item = media
                    exit for
                end if
            end for
            if item <> invalid and positionFor(mediaId) > 0
                candidate = item
                identity = item.id
                if isTv(item)
                    identity = "series:" + item.seriesId
                    if completed(item) and m.groups[item.seriesId] <> invalid
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
                else if completed(item)
                    candidate = invalid
                end if
                if seen[identity] = invalid
                    seen[identity] = true
                    if candidate <> invalid then continuing.push(candidate)
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
        m.homeFeatured = dailyFeaturedMovie(choices, available)
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
    else if title = "My List"
        for each item in m.media
            if not isTv(item) and m.favorites[item.id] <> invalid then items.push(item)
        end for
        for each item in shows
            if m.favorites[item.id] <> invalid then items.push(item)
        end for
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
        showCatalogPage(title, items)
        return
    end if
    if title = "Home Videos"
        byYear = {}
        years = []
        undated = []
        for each item in items
            if item.year <> invalid and item.year > 0
                year = item.year.toStr()
                if byYear[year] = invalid
                    byYear[year] = []
                    years.push(item.year)
                end if
                byYear[year].push(item)
            else
                undated.push(item)
            end if
        end for
        years.sort("r")
        for each year in years
            rows.push({title: year.toStr(), items: byYear[year.toStr()]})
        end for
        if undated.count() > 0 then rows.push({title: "Undated", items: undated})
        showRows(rows)
        return
    end if
    if title <> "Home" then rows.push({title: title, items: items})
    showRows(rows)
    if title = "Home" and m.homeFeatured <> invalid
        m.heading.text = ""
        m.status.text = ""
        m.homeHero.item = m.homeFeatured
        m.homeHero.visible = true
        m.homeHero.callFunc("activate")
    end if
end sub

function dailyFeaturedMovie(choices as object, available as object) as dynamic
    if choices.count() = 0 then return invalid
    saved = m.dailyFeatured[m.profile.id]
    if saved <> invalid
        if saved.expires <> invalid and saved.expires > nowMillis()
            for each movie in available
                if movie.id = saved.id then return movie
            end for
        end if
    end if
    candidates = []
    for each movie in choices
        if saved = invalid
            candidates.push(movie)
        else if movie.id <> saved.id
            candidates.push(movie)
        end if
    end for
    if candidates.count() = 0 then candidates = choices
    movie = candidates[Rnd(candidates.count()) - 1]
    m.dailyFeatured[m.profile.id] = {id: movie.id, expires: nowMillis() + 86400000.0#}
    registryOperation("write", "featured", FormatJson(m.dailyFeatured))
    return movie
end function

sub onHomeShelvesRequested()
    if m.rows.visible then m.rows.setFocus(true)
    updateHomeHero()
end sub

sub updateHomeHero()
    if m.section <> "Home" or not m.rows.visible then return
    selected = m.rows.rowItemFocused
    if selected = invalid then return
    row = m.rows.content.getChild(selected[0])
    if row = invalid then return
    child = row.getChild(selected[1])
    if child = invalid then return
    item = {}
    item.append(child.media)
    if item.kind <> invalid and item.kind = "show"
        first = m.groups[item.seriesId][0]
        for each key in ["description", "year", "rating", "genres"]
            item[key] = first[key]
        end for
    end if
    m.homeHero.item = item
end sub

sub onHomeHeroAction(event as object)
    item = m.homeHero.item
    m.history.push({screen: "browse", section: "Home", rows: m.visibleRows, focus: m.rows.rowItemFocused, hero: item})
    showDetails(item)
    if event.GetData() = "play" then startPlayback(m.detailPlayItem)
end sub

sub showCatalogPage(title as string, items as object, index = 0 as integer)
    m.screen = "catalog"
    m.section = title
    m.rows.visible = false
    content = CreateObject("roSGNode", "ContentNode")
    for each item in items
        display = {}
        display.append(item)
        if item.kind <> invalid and item.kind = "show"
            first = m.groups[item.seriesId][0]
            for each key in ["description", "year", "rating", "genres", "minAge"]
                display[key] = first[key]
            end for
        end if
        child = content.createChild("ContentNode")
        child.title = display.title
        if display.thumbnailUrl <> invalid then child.hdPosterUrl = display.thumbnailUrl
        child.addFields({media: display, watchedFraction: watchedFraction(display)})
    end for
    m.catalogPage.content = content
    m.catalogPage.visible = true
    m.catalogPage.callFunc("activate", index)
end sub

sub onCatalogSelected(event as object)
    m.history.push({screen: "catalog", section: m.section, content: m.catalogPage.content, focus: m.catalogPage.focusedIndex})
    showDetails(event.GetData())
end sub

sub showRows(rows as object)
    m.rows.translation = [400,270]
    m.rows.numRows = 2
    if m.screen = "browse" and m.section = "Home"
        m.rows.translation = [400,540]
        m.rows.numRows = 1
    end if
    m.visibleRows = []
    itemSizes = []
    rowHeights = []
    content = CreateObject("roSGNode", "ContentNode")
    for each row in rows
        if row.items.count() > 0
            m.visibleRows.push(row)
            height = 320
            first = row.items[0]
            if first.kind <> invalid and first.kind = "collection" then height = 188
            itemSizes.push([332, height])
            rowHeights.push(height + 50)
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
    m.rows.rowItemSize = itemSizes
    m.rows.rowHeights = rowHeights
    m.rows.content = content
    m.rows.visible = content.getChildCount() > 0
    if m.rows.visible then m.rows.setFocus(true) else m.menu.setFocus(true)
    if content.getChildCount() = 0 then m.status.text = "Nothing here yet."
end sub

sub onItemFocused()
    if m.screen <> "browse" and m.screen <> "episodes" then return
    if m.section = "Home" and m.screen = "browse"
        if m.rows.hasFocus() then updateHomeHero()
        return
    end if
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
    m.history.push({screen: m.screen, section: m.section, rows: m.visibleRows, focus: selected})
    if item.kind = "show"
        showDetails(item)
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

sub startPlayback(item as object)
    if item.blocked then return
    m.playingItem = item
    m.status.text = "Loading video..."
    api("play", "/api/media/" + escaped(item.id) + "/play", "POST", profileRequestBody())
end sub

sub savePosition()
    if m.playingItem = invalid then return
    m.progressRevision = m.progressRevision + 1
    position = int(m.playbackPosition)
    if position <= 0 then return
    m.positions[m.playingItem.id] = position
    ordered = [m.playingItem.id]
    for each id in m.progressOrder
        if id <> m.playingItem.id then ordered.push(id)
    end for
    m.progressOrder = ordered
    m.pendingProgress = profileRequestBody(m.playingItem.id, position)
    sendPendingProgress()
end sub

sub sendPendingProgress()
    if m.progressSaving or m.pendingProgress = invalid then return
    body = m.pendingProgress
    m.pendingProgress = invalid
    m.progressSaving = true
    api("progress-save", "/api/progress", "POST", body)
end sub

sub refreshHomeProgress()
    sendPendingProgress()
    if m.screen <> "browse" or m.section <> "Home" or m.video.visible then return
    if m.progressSaving or m.progressRefreshing or m.pendingProgress <> invalid then return
    m.progressRefreshing = true
    api("progress-refresh", "/api/progress?profileId=" + escaped(m.profile.id))
end sub

sub onVideoPosition()
    if not m.video.visible then return
    if m.video.position <> m.playbackPosition and m.playbackActivity <> invalid then m.playbackActivity.Mark()
    m.playbackPosition = m.video.position
    if abs(m.video.position - m.lastSaved) >= 15
        m.lastSaved = m.video.position
        savePosition()
    end if
end sub

sub onVideoState()
    if not m.video.visible then return
    state = m.video.state
    print "KINGFLIX player state: "; state; " position: "; m.playbackPosition
    if state = "paused"
        m.playbackPosition = m.video.position
        savePosition()
    end if
    if state = "playing" and m.playbackActivity <> invalid then m.playbackActivity.Mark()
    if state = "finished" and m.playingItem.durationSeconds <> invalid then m.playbackPosition = m.playingItem.durationSeconds
    if state = "error"
        message = "Playback failed (" + m.video.errorCode.toStr() + "). " + m.video.errorMsg
        print "KINGFLIX "; message
        closePlayback(message)
    else if state = "finished" or state = "stopped"
        closePlayback()
    end if
end sub

sub closePlayback(message = "" as string)
    savePosition()
    m.top.findNode("playbackWatchdog").control = "STOP"
    m.video.visible = false
    m.video.control = "stop"
    if m.screen = "details" then showDetails(m.detailItem) else showSection(m.section)
    if message <> "" then m.status.text = message + " Select Watch to retry."
end sub

sub checkPlaybackStall()
    sendPendingProgress()
    if not m.video.visible or m.playbackActivity = invalid then return
    if m.top.dialog = invalid and not m.video.hasFocus() then m.video.setFocus(true)
    state = m.video.state
    if state = "paused" then m.playbackActivity.Mark()
    if (state = "playing" or state = "buffering") and m.playbackActivity.TotalMilliseconds() >= 60000
        print "KINGFLIX stalled: "; m.playingItem.id; " at "; m.playbackPosition; " state "; state
        closePlayback("Playback stalled for a minute. Your viewing position was saved locally.")
    end if
end sub

sub goBack()
    m.detailPage.visible = false
    m.top.findNode("detailThumbnail").visible = false
    m.status.width = 1430
    m.status.height = 100
    m.actions.visible = false
    if m.history.count() > 0
        previous = m.history.pop()
        if previous.screen = "search" then showSearch() : return
        if previous.screen = "details" then showDetails(previous.item) : return
        if previous.screen = "catalog"
            m.screen = "catalog"
            m.section = previous.section
            m.menu.activeTitle = previous.section
            m.catalogPage.content = previous.content
            m.catalogPage.visible = true
            m.catalogPage.callFunc("activate", previous.focus)
            return
        end if
        m.screen = previous.screen
        m.section = previous.section
        m.menu.activeTitle = previous.section
        m.heading.text = previous.section
        showRows(previous.rows)
        m.rows.jumpToRowItem = previous.focus
        if previous.section = "Home"
            m.homeHero.visible = true
            m.heading.text = ""
            m.status.text = ""
            updateHomeHero()
            if previous.hero <> invalid
                m.homeHero.item = previous.hero
                m.homeHero.callFunc("activate")
            end if
        end if
    else
        if m.profile.homeVideosOnly then showSection("Home Videos") else showSection("Home")
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if m.screen = "profiles"
        if not press
            if key = "OK" then m.profileOpeningOk = false
            return false
        end if
        if key = "OK" and m.profileOpeningOk then return true
        if key = "up" or key = "down" or key = "left" or key = "right" then m.profileOpeningOk = false
        return profileKey(key)
    end if
    if not press then return false
    if m.video.visible
        if key = "back"
            if m.video.position > 0 then m.playbackPosition = m.video.position
            closePlayback()
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
    if m.screen = "pairing" and key = "OK"
        m.poll.control = "STOP"
        beginPairing()
        return true
    end if
    if key = "up" and m.rows.hasFocus() and m.section = "Home" and m.screen = "browse"
        if m.rows.rowItemFocused[0] = 0
            m.homeHero.callFunc("activate")
            return true
        end if
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
    if m.screen = "details" then m.detailPage.notice = m.status.text
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

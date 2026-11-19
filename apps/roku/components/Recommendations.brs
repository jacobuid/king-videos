' Visual style is a hard boundary, including within a franchise/collection.
function recommendationStyle(item as object) as string
    overrides = m.config.recommendations.styleOverrides
    if overrides[item.id] <> invalid then return overrides[item.id]
    genres = recommendationGenres(item)
    if includes(genres, "Stop Motion") or includes(genres, "Stop-Motion") then return "stop-motion"
    if includes(genres, "Cartoon")
        if includes(genres, "Live Action") then return "hybrid-2d"
        return "2d"
    end if
    if includes(genres, "Animation")
        if includes(genres, "Live Action") then return "hybrid-3d"
        return "3d"
    end if
    return "live-action"
end function

function recommendationGenres(item as object) as object
    if item.genres = invalid then return []
    return item.genres
end function

function recommendationGenreWeight(genre as string) as integer
    if includes(["Cartoon", "Animation", "Live Action", "Stop Motion", "Stop-Motion", "Classic"], genre) then return 0
    if includes(["Action", "Adventure", "Comedy", "Drama", "Family", "Kids"], genre) then return 2
    return 6
end function

function recommendationAudience(item as object) as integer
    if item.rating = invalid then return -1
    rating = ucase(item.rating)
    if includes(["G", "TV-Y", "TV-G"], rating) then return 0
    if includes(["PG", "TV-Y7", "TV-Y7-FV"], rating) then return 1
    if includes(["PG-13", "TV-PG", "TV-14"], rating) then return 2
    if includes(["R", "TV-MA", "NC-17"], rating) then return 3
    return -1
end function

function recommendationRatingScore(source as object, candidate as object) as integer
    sourceAudience = recommendationAudience(source)
    candidateAudience = recommendationAudience(candidate)
    if sourceAudience < 0 or candidateAudience < 0 then return 0
    return int((4-abs(sourceAudience-candidateAudience))*1000)
end function

function recommendationRelationship(source as object, candidate as object) as integer
    priority = 0
    for each group in m.config.recommendations.franchises
        if includes(group, source.id)
            for i = 0 to group.count()-1
                if group[i] = candidate.id then priority = 100000 - i*1000
            end for
        end if
    end for
    for each collection in m.config.collections
        if includes(collection.mediaIds, source.id) and includes(collection.mediaIds, candidate.id)
            score = 40
            if not includes(m.config.recommendations.themeCollections, collection.id)
                for i = 0 to collection.mediaIds.count()-1
                    if collection.mediaIds[i] = candidate.id then score = 100000 - i*1000
                end for
            end if
            if score > priority then priority = score
        end if
    end for
    return priority
end function

function recommendationEraScore(source as object, candidate as object) as integer
    if source.year = invalid or candidate.year = invalid then return 0
    if source.year <= 0 or candidate.year <= 0 then return 0
    distance = abs(source.year-candidate.year)
    style = recommendationStyle(source)
    score = 160 - distance*6
    if style <> "live-action" then score = 200 - distance*8
    if style = "2d" or style = "stop-motion" then score = 360 - distance*12
    if score < 0 then return 0
    return int(score)
end function

function recommendationScore(source as object, candidate as object) as integer
    if source.id = candidate.id or source.category <> candidate.category then return -1
    if candidate.kind <> invalid and candidate.kind = "show" then return -1
    if candidate.blocked <> invalid and candidate.blocked then return -1
    if recommendationStyle(source) <> recommendationStyle(candidate) then return -1
    sourceGenres = recommendationGenres(source)
    candidateGenres = recommendationGenres(candidate)
    shared = 0
    total = 0
    matches = 0
    for each genre in sourceGenres
        weight = recommendationGenreWeight(genre)
        total += weight
        if weight > 0 and includes(candidateGenres, genre)
            shared += weight
            matches++
        end if
    end for
    for each genre in candidateGenres
        if not includes(sourceGenres, genre) then total += recommendationGenreWeight(genre)
    end for
    relationship = recommendationRelationship(source, candidate)
    if relationship = 0 and shared = 0 then return -1
    score = relationship + matches*10
    if total > 0 then score += int(100.0 * shared / total)
    ' Outside a franchise, rating proximity outranks genre/era/theme bonuses.
    if relationship < 50000 then score += recommendationRatingScore(source,candidate)
    sourceAudience = recommendationAudience(source)
    candidateAudience = recommendationAudience(candidate)
    if sourceAudience >= 0 and candidateAudience >= 0 then score -= abs(sourceAudience-candidateAudience)*15
    score += recommendationEraScore(source, candidate)
    return int(score)
end function

function rankedRecommendations(source as object, catalog as object, limit = 30 as integer) as object
    ranked = []
    for each candidate in catalog
        score = recommendationScore(source, candidate)
        if score >= 0
            entry = {item:candidate,score:score}
            ranked.push(entry)
            index = ranked.count()-1
            while index > 0
                if ranked[index-1].score >= score then exit while
                ranked[index] = ranked[index-1]
                index--
            end while
            ranked[index] = entry
            if ranked.count() > limit then ranked.pop()
        end if
    end for
    result = []
    for each entry in ranked
        result.push(entry.item)
    end for
    return result
end function

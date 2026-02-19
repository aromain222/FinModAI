# News Routing Logic - Pseudocode

## Two-Stage Gate Algorithm

```
FUNCTION routeArticle(article, openai):
  // Stage 1: Quality Filter (Fast, Deterministic)
  stage1Result = stage1QualityFilter(article)
  
  IF NOT stage1Result.passed:
    RETURN {
      lane: "drop",
      market_relevance_score: 0,
      world_relevance_score: 0,
      reason: stage1Result.reason,
      confidence: "high"
    }
  END IF
  
  // Stage 2: LLM Classification
  routing = stage2LLMClassification(article, openai)
  
  // Apply threshold rules
  IF routing.lane == "market":
    IF routing.market_relevance_score < 70 OR routing.confidence == "low":
      // Downgrade to world or drop
      routing.lane = (routing.world_relevance_score >= 60) ? "world" : "drop"
    END IF
  ELSE IF routing.lane == "world":
    IF routing.world_relevance_score < 60:
      routing.lane = "drop"
    END IF
  END IF
  
  // When in doubt: world > drop > market
  IF routing.confidence == "low" AND routing.lane == "market":
    routing.lane = (routing.world_relevance_score >= 50) ? "world" : "drop"
  END IF
  
  RETURN routing
END FUNCTION
```

## Stage 1 Quality Filter

```
FUNCTION stage1QualityFilter(article):
  title = article.title.toLowerCase()
  url = article.url.toLowerCase()
  summary = article.summary.toLowerCase()
  combined = title + " " + summary
  
  // Domain blacklist check
  FOR EACH blacklistedDomain IN blacklistedDomains:
    IF url.contains(blacklistedDomain):
      RETURN { passed: false, reason: "Blacklisted domain" }
    END IF
  END FOR
  
  // Non-market pattern check
  FOR EACH pattern IN nonMarketPatterns:
    IF pattern.test(title):
      RETURN { passed: false, reason: "Non-market pattern" }
    END IF
  END FOR
  
  // Hobby keyword check
  FOR EACH keyword IN hobbyKeywords:
    IF combined.contains(keyword):
      RETURN { passed: false, reason: "Hobby keyword" }
    END IF
  END FOR
  
  // Software release check (unless major platform)
  isMajorPlatform = /(windows|ios|android|macos|linux|chrome|firefox|safari)/i.test(title)
  IF NOT isMajorPlatform:
    FOR EACH pattern IN softwareReleasePatterns:
      IF pattern.test(title):
        RETURN { passed: false, reason: "Software release" }
      END IF
    END FOR
  END IF
  
  RETURN { passed: true }
END FUNCTION
```

## Deduplication Algorithm

```
FUNCTION deduplicateArticles(articles):
  seen = new Map<url, article>()
  urlMap = new Map<canonicalUrl, article>()
  
  FOR EACH article IN articles:
    // Canonicalize URL
    urlObj = new URL(article.url)
    canonicalUrl = urlObj.protocol + "//" + urlObj.hostname + urlObj.pathname
    canonicalUrl = canonicalUrl.replace(/\/$/, "")
    
    // Check exact URL match
    IF urlMap.has(canonicalUrl):
      existing = urlMap.get(canonicalUrl)
      // Keep more reputable source
      IF isMoreReputable(article.source, existing.source):
        urlMap.set(canonicalUrl, article)
        seen.set(article.url, article)
        seen.delete(existing.url)
      END IF
      CONTINUE
    END IF
    
    // Check title similarity
    normalizedTitle = normalize(article.title)
    isDuplicate = false
    
    FOR EACH [existingUrl, existing] IN seen:
      existingNormalized = normalize(existing.title)
      similarity = calculateSimilarity(normalizedTitle, existingNormalized)
      
      IF similarity > 0.8:
        // Keep more reputable source
        IF isMoreReputable(article.source, existing.source):
          seen.delete(existingUrl)
          seen.set(article.url, article)
          urlMap.set(canonicalUrl, article)
        END IF
        isDuplicate = true
        BREAK
      END IF
    END FOR
    
    IF NOT isDuplicate:
      seen.set(article.url, article)
      urlMap.set(canonicalUrl, article)
    END IF
  END FOR
  
  RETURN Array.from(seen.values())
END FUNCTION
```

## Market Brief API Flow

```
FUNCTION getMarketBriefNews():
  // Fetch raw news
  newsItems = fetchMacroNews(30)
  
  // Route articles
  routedArticles = []
  FOR EACH item IN newsItems:
    routing = routeArticle(item, openai)
    IF routing.lane == "market":
      routedArticles.push({ item, routing })
    ELSE:
      LOG("Article routed to {routing.lane}: {item.title}")
    END IF
  END FOR
  
  // Deduplicate
  deduplicated = deduplicateArticles(routedArticles.map(r => r.item))
  
  // Enrich with AI intelligence
  enrichedNews = []
  FOR EACH item IN deduplicated.slice(0, 10):
    intelligence = generateArticleIntelligence(item)
    routing = routedArticles.find(r => r.item.url === item.url).routing
    
    enrichedNews.push({
      ...item,
      ...intelligence,
      routing: {
        lane: routing.lane,
        market_relevance_score: routing.market_relevance_score,
        topics: routing.topics,
        confidence: routing.confidence
      }
    })
  END FOR
  
  RETURN enrichedNews
END FUNCTION
```

## World Brief API Flow

```
FUNCTION getWorldBriefNews(marketLens = false):
  // Fetch raw news
  newsItems = fetchMacroNews(30)
  
  // Route articles
  routedArticles = []
  FOR EACH item IN newsItems:
    routing = routeArticle(item, openai)
    IF routing.lane == "world" OR (marketLens AND routing.lane == "market"):
      routedArticles.push({ item, routing })
    END IF
  END FOR
  
  // Deduplicate
  deduplicated = deduplicateArticles(routedArticles.map(r => r.item))
  
  // Enrich with summaries
  enrichedNews = []
  FOR EACH routed IN routedArticles.filter(r => deduplicated.includes(r.item)):
    { item, routing } = routed
    
    // Generate summaries
    IF openai:
      summaries = generateSummaries(item, routing, marketLens)
    ELSE:
      summaries = templateSummaries(item, routing, marketLens)
    END IF
    
    enrichedNews.push({
      ...item,
      ...summaries,
      topics: routing.topics,
      routing: {
        lane: routing.lane,
        market_relevance_score: routing.market_relevance_score,
        world_relevance_score: routing.world_relevance_score
      }
    })
  END FOR
  
  RETURN enrichedNews
END FUNCTION
```

// efortech_backend\controllers\articleController.js
const db = require("../config/db");
const {
  sendSuccessResponse,
  sendCreatedResponse,
  sendBadRequestResponse,
  sendErrorResponse,
} = require("../utils/responseUtils");

// Get all articles WITH PAGINATION
exports.getArticles = async (req, res) => {
  try {
    const {
      sort_by = "create_date",
      sort_order = "desc",
      page = 1,
      limit = 12,
      category,
      search,
    } = req.query;

    // Validation
    const allowedSortBy = ["title", "create_date", "views"];
    const allowedSortOrder = ["asc", "desc"];

    const sortBy = allowedSortBy.includes(sort_by) ? sort_by : "create_date";
    const sortOrder = allowedSortOrder.includes(sort_order.toLowerCase())
      ? sort_order.toUpperCase()
      : "DESC";

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 12;
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause dynamically
    let whereClause = "WHERE 1=1";
    const queryParams = [];
    let paramIndex = 1;

    // Filter by category
    if (category && category !== "All" && category !== "0") {
      queryParams.push(category);
      whereClause += ` AND category = $${paramIndex}`;
      paramIndex++;
    }

    // Filter by search
    if (search && search.trim()) {
      queryParams.push(`%${search}%`);
      whereClause += ` AND (title ILIKE $${paramIndex} OR content_body ILIKE $${paramIndex})`;
      paramIndex++;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM articles ${whereClause}`;
    const { rows: countRows } = await db.query(countQuery, queryParams);
    const totalArticles = parseInt(countRows[0].count);

    // Get paginated articles
    const articlesQuery = `
      SELECT * FROM articles 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limitNum, offset);
    const { rows: articles } = await db.query(articlesQuery, queryParams);

    // Process articles
    for (const article of articles) {
      article.images = Array.isArray(article.images) ? article.images : [];
      article.sources = article.sources || [];
      article.tags = article.tags || [];
    }

    // Return paginated response
    sendSuccessResponse(res, "FETCH_SUCCESS", {
      articles,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalArticles / limitNum),
        totalArticles,
        articlesPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(totalArticles / limitNum),
        hasPreviousPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching articles:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Get most viewed articles (for carousel)
exports.getMostViewedArticles = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 3;

    const { rows: articles } = await db.query(
      `SELECT * FROM articles 
       ORDER BY views DESC 
       LIMIT $1`,
      [limit]
    );

    for (const article of articles) {
      article.images = Array.isArray(article.images) ? article.images : [];
      article.sources = article.sources || [];
      article.tags = article.tags || [];
    }

    sendSuccessResponse(res, "FETCH_SUCCESS", articles);
  } catch (error) {
    console.error("Error fetching most viewed articles:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Add article
exports.addArticle = async (req, res) => {
  try {
    const { title, category, content_body, admin_id, author } = req.body;

    const parsedSources = Array.isArray(req.body.sources)
      ? req.body.sources
      : [];
    const parsedTags = Array.isArray(req.body.tags) ? req.body.tags : [];

    if (!title || !category || !content_body || !admin_id || !author) {
      return sendBadRequestResponse(res, "Missing required fields");
    }

    if (
      !Array.isArray(parsedSources) ||
      parsedSources.some((src) => !src.preview_text || !src.source_link)
    ) {
      return sendBadRequestResponse(
        res,
        "Sources must be an array of objects with preview_text and source_link"
      );
    }

    if (!Array.isArray(parsedTags)) {
      return sendBadRequestResponse(res, "Tags must be an array of strings");
    }

    const create_date = new Date();
    const generateArticleId = () => {
      const now = new Date();
      now.setHours(now.getHours() + 7);
      const timestamp = now
        .toISOString()
        .replace(/[-T:.Z]/g, "")
        .slice(0, 12);
      const randomStr = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
      return `ARTC-${timestamp}-${randomStr}`;
    };

    const article_id = generateArticleId();

    const imageUrls = Array.isArray(req.body.images)
      ? req.body.images.filter(
          (url) => typeof url === "string" && url.startsWith("http")
        )
      : [];

    await db.query(
      `INSERT INTO articles 
      (article_id, title, category, content_body, create_date, admin_id, author, sources, images, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        article_id,
        title,
        category,
        content_body,
        create_date,
        admin_id,
        author,
        JSON.stringify(parsedSources),
        imageUrls,
        parsedTags,
      ]
    );

    sendCreatedResponse(res, "GENERAL_SUCCESS", { article_id });
  } catch (error) {
    console.error("Error adding article:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Get article by ID
exports.getArticleById = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await db.query(
      "SELECT * FROM articles WHERE article_id = $1",
      [id]
    );

    const article = rows[0];

    if (!article) {
      return sendSuccessResponse(res, `No article found with ID: ${id}`);
    }

    article.images = Array.isArray(article.images) ? article.images : [];
    article.sources = article.sources || [];
    article.tags = article.tags || [];

    sendSuccessResponse(res, "FETCH_SUCCESS", article);
  } catch (error) {
    console.error("Error fetching article:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Delete article
exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM articles WHERE article_id = $1", [id]);
    sendSuccessResponse(res, "GENERAL_SUCCESS");
  } catch (error) {
    console.error("Error deleting article:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Update article
exports.updateArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, content_body, author, tags, sources, images } =
      req.body;

    if (!title || !category || !content_body || !author) {
      return sendBadRequestResponse(res, "All required fields must be filled");
    }

    if (
      !Array.isArray(sources) ||
      sources.some((src) => !src.preview_text || !src.source_link)
    ) {
      return sendBadRequestResponse(
        res,
        "Sources must be an array of objects with preview_text and source_link"
      );
    }

    if (!Array.isArray(tags)) {
      return sendBadRequestResponse(res, "Tags must be an array of strings");
    }

    const imageUrls = Array.isArray(images)
      ? images.filter(
          (url) => typeof url === "string" && url.startsWith("http")
        )
      : [];

    const result = await db.query(
      `UPDATE articles 
       SET title = $1,
           category = $2,
           content_body = $3,
           author = $4,
           sources = $5,
           images = $6,
           tags = $7
       WHERE article_id = $8`,
      [
        title,
        category,
        content_body,
        author,
        JSON.stringify(sources || []),
        imageUrls,
        tags || [],
        id,
      ]
    );

    if (result.rowCount === 0) {
      return sendSuccessResponse(res, "Article not found");
    }

    sendSuccessResponse(res, "GENERAL_SUCCESS");
  } catch (error) {
    console.error("Error updating article:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Search articles - DEPRECATED, use getArticles with search param
exports.searchArticles = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return sendBadRequestResponse(res, "Query parameter is required");
    }

    const { rows: articles } = await db.query(
      `SELECT * FROM articles 
       WHERE title ILIKE $1 OR content_body ILIKE $2 
       ORDER BY create_date DESC`,
      [`%${query}%`, `%${query}%`]
    );

    if (articles.length === 0) {
      return sendSuccessResponse(res, "Article not found");
    }

    for (const article of articles) {
      article.tags = article.tags || [];
      article.sources = article.sources || [];
      article.images = Array.isArray(article.images) ? article.images : [];
    }

    sendSuccessResponse(res, "FETCH_SUCCESS", articles);
  } catch (error) {
    console.error("Error searching articles:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Get articles by category
exports.getArticlesByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const { rows: articles } = await db.query(
      "SELECT * FROM articles WHERE category = $1 ORDER BY create_date DESC",
      [category]
    );

    for (const article of articles) {
      article.tags = article.tags || [];
      article.sources = article.sources || [];
      article.images = Array.isArray(article.images) ? article.images : [];
    }

    sendSuccessResponse(res, "FETCH_SUCCESS", articles);
  } catch (error) {
    console.error("Error fetching articles by category:", error);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

// Get articles by tag
exports.getArticlesByTag = async (req, res) => {
  try {
    const tag_text = req.params.tag_text;

    if (!tag_text || tag_text.trim() === "") {
      return sendBadRequestResponse(res, "Tag parameter is required.");
    }

    const { rows: articles } = await db.query(
      `SELECT * FROM articles 
       WHERE EXISTS (
         SELECT 1 FROM unnest(tags) AS tag
         WHERE LOWER(tag) = LOWER($1)
       )
       ORDER BY create_date DESC`,
      [tag_text]
    );

    if (!articles || articles.length === 0) {
      return sendSuccessResponse(
        res,
        `No articles found for tag '${tag_text}'.`
      );
    }

    for (const article of articles) {
      article.tags = article.tags || [];
      article.sources = article.sources || [];
      article.images = Array.isArray(article.images) ? article.images : [];
    }

    sendSuccessResponse(res, "FETCH_SUCCESS", articles);
  } catch (error) {
    console.error("Error fetching articles by tag:", error.message);
    sendErrorResponse(res, "GENERAL_ERROR");
  }
};

exports.updateViewsArticle = async (req, res) => {
  const { article_id } = req.params;
  try {
    await db.query(
      "UPDATE articles SET views = views + 1 WHERE article_id = $1",
      [article_id]
    );
    res.status(200).json({ message: "View incremented" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

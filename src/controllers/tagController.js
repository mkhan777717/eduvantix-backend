'use strict';

/**
 * tagController.js
 *
 * Manage discussion tags and retrieve popular tags.
 */

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const { tagSchema } = require('../utils/validators');

/**
 * GET /api/discuss/tags
 * List tags with search and pagination.
 */
const listTags = async (req, res, next) => {
  try {
    const { search } = req.query;

    const baseWhere = {};
    if (search && typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      baseWhere.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }

    const config = {
      modelName: 'discussionTag',
      defaultSort: 'usageCount',
      defaultOrder: 'desc',
      searchFields: ['name', 'slug'],
    };

    const result = await PaginationService.paginate({
      model: prisma.discussionTag,
      query: req.query,
      config,
      where: baseWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        usageCount: true,
        createdAt: true,
      },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/tags/popular
 * Get top 20 tags by denormalized usageCount.
 */
const getPopularTags = async (req, res, next) => {
  try {
    const tags = await prisma.discussionTag.findMany({
      orderBy: { usageCount: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        slug: true,
        usageCount: true,
      },
    });

    res.status(200).json({
      success: true,
      tags,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/tags
 * Create a new tag (staff only).
 */
const createTag = async (req, res, next) => {
  try {
    const validated = tagSchema.parse(req.body);
    const slug = validated.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');

    const existing = await prisma.discussionTag.findFirst({
      where: { OR: [{ name: validated.name }, { slug }] },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'Tag already exists.' });
    }

    const tag = await prisma.discussionTag.create({
      data: {
        name: validated.name.trim(),
        slug,
        description: validated.description || null,
      },
    });

    res.status(201).json({
      success: true,
      tag,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listTags,
  getPopularTags,
  createTag,
};

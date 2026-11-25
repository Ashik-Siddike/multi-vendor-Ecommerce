const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { createNotification } = require('../utils/notify');

/**
 * Ask a question about a product
 * POST /api/v1/products/:productId/questions (Customer only)
 */
const askQuestion = async (req, res) => {
  try {
    const { productId } = req.params;
    const { question } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return sendError(res, 400, 'Question text is required');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: true },
    });

    if (!product) {
      return sendError(res, 404, 'Product not found');
    }

    const created = await prisma.productQuestion.create({
      data: {
        productId,
        userId: req.user.id,
        question: question.trim(),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Notify vendor owner
    await createNotification({
      userId: product.shop.ownerId,
      title: 'New Product Question',
      message: `A customer asked a question on "${product.name}": "${question.trim()}"`,
      type: 'SYSTEM',
    });

    return sendSuccess(res, 201, 'Question submitted successfully', { question: created });
  } catch (error) {
    console.error('Error asking question:', error);
    return sendError(res, 500, 'Failed to submit question');
  }
};

/**
 * Get all Q&A for a product (Public)
 * GET /api/v1/products/:productId/questions
 */
const getProductQuestions = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }

    const questions = await prisma.productQuestion.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return sendSuccess(res, 200, 'Product questions retrieved successfully', { questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return sendError(res, 500, 'Failed to fetch questions');
  }
};

/**
 * Vendor answers a product question (Strict Shop Ownership Check)
 * PATCH /api/v1/questions/:id/answer (Vendor only)
 */
const answerQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      return sendError(res, 400, 'Answer text is required');
    }

    const q = await prisma.productQuestion.findUnique({
      where: { id },
      include: {
        product: { include: { shop: true } },
      },
    });

    if (!q) {
      return sendError(res, 404, 'Question not found');
    }

    if (q.product.shop.ownerId !== req.user.id) {
      return sendError(
        res,
        403,
        'Forbidden: Only the vendor who owns this product can answer this question.'
      );
    }

    const updated = await prisma.productQuestion.update({
      where: { id },
      data: {
        answer: answer.trim(),
        answeredAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    await createNotification({
      userId: q.userId,
      title: 'Your Question was Answered',
      message: `The seller answered your question about "${q.product.name}".`,
      type: 'SYSTEM',
    });

    return sendSuccess(res, 200, 'Answer posted successfully', { question: updated });
  } catch (error) {
    console.error('Error answering question:', error);
    return sendError(res, 500, 'Failed to post answer');
  }
};

module.exports = {
  askQuestion,
  getProductQuestions,
  answerQuestion,
};

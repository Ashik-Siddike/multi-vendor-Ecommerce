const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get notifications for logged-in user
 * GET /api/v1/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      }),
    ]);

    return sendSuccess(res, 200, 'Notifications retrieved successfully', {
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return sendError(res, 500, 'Failed to fetch notifications');
  }
};

/**
 * Mark a single notification as read
 * PATCH /api/v1/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({ where: { id } });

    if (!notification) {
      return sendError(res, 404, 'Notification not found');
    }
    if (notification.userId !== req.user.id) {
      return sendError(res, 403, 'Forbidden');
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return sendSuccess(res, 200, 'Notification marked as read', { notification: updated });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return sendError(res, 500, 'Failed to update notification');
  }
};

/**
 * Mark all notifications as read
 * PATCH /api/v1/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    return sendSuccess(res, 200, 'All notifications marked as read');
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return sendError(res, 500, 'Failed to mark notifications as read');
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};

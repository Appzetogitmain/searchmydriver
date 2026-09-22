import React from 'react';
import { create } from 'zustand';
import toast from 'react-hot-toast';
import api from '../utils/api';

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isInitialized: false,

  fetchNotifications: async (prefix = '/auth') => {
    try {
      const res = await api.get(`${prefix}/notifications`);
      const { notifications, unreadCount } = res.data.data;
      set({ notifications, unreadCount, isInitialized: true });
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  },

  selectedNotification: null,
  setSelectedNotification: (notification) => set({ selectedNotification: notification }),

  handleNewNotification: (notification) => {
    // Show a toast when a new notification arrives in real-time
    const severityMap = {
      info: toast,
      success: toast.success,
      warning: toast,
      error: toast.error,
    };
    
    const showToast = severityMap[notification.severity] || toast;
    
    // Use standard toast layout from react-hot-toast (pre-styled, animated, always visible)
    // with an onClick handler on the inner content to preserve selected notification loading.
    showToast(
      React.createElement(
        'div',
        {
          className: 'cursor-pointer min-w-[220px]',
          onClick: () => {
            get().setSelectedNotification(notification);
          }
        },
        React.createElement(
          'p',
          { className: 'font-semibold text-sm text-gray-900' },
          notification.title
        ),
        notification.body && React.createElement(
          'p',
          { className: 'text-xs text-gray-500 mt-0.5' },
          notification.body
        )
      ),
      {
        duration: 5000,
        icon: notification.severity === 'warning' ? '⚠️' : (notification.severity === 'success' ? '✅' : '🔔'),
      }
    );

    set((state) => {
      const targetId = notification._id || notification.id;
      if (targetId && state.notifications.some((n) => (n._id || n.id) === targetId)) {
        return state;
      }
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };
    });
  },

  markAsRead: async (id, prefix = '/auth') => {
    // Optimistic UI update
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n._id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));

    try {
      await api.patch(`${prefix}/notifications/${id}/read`);
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  },

  markAllAsRead: async (prefix = '/auth') => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));

    try {
      await api.patch(`${prefix}/notifications/read-all`);
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    }
  },

  deleteNotification: async (id, prefix = '/auth') => {
    const target = get().notifications.find((n) => (n._id || n.id) === id);
    const wasUnread = target && !target.isRead;

    // Optimistic UI update
    set((state) => ({
      notifications: state.notifications.filter((n) => (n._id || n.id) !== id),
      unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      selectedNotification:
        state.selectedNotification && (state.selectedNotification._id || state.selectedNotification.id) === id
          ? null
          : state.selectedNotification,
    }));

    try {
      await api.delete(`${prefix}/notifications/${id}`);
    } catch (err) {
      console.error('Failed to delete notification', err);
      toast.error('Failed to delete notification');
      get().fetchNotifications(prefix);
    }
  },

  clearAllNotifications: async (prefix = '/auth') => {
    // Optimistic UI update
    set({
      notifications: [],
      unreadCount: 0,
      selectedNotification: null,
    });

    try {
      await api.delete(`${prefix}/notifications/clear-all`);
    } catch (err) {
      console.error('Failed to clear notifications', err);
      toast.error('Failed to clear notifications');
      get().fetchNotifications(prefix);
    }
  },

  reset: () => {
    set({ notifications: [], unreadCount: 0, isInitialized: false });
  },
}));

export default useNotificationStore;


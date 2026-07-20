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
    
    // Create a custom render for the toast to make it clickable
    toast.custom((t) => {
      return React.createElement(
        'div',
        {
          className: `${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white shadow-lg rounded-xl pointer-events-auto flex ring-1 ring-black/5 cursor-pointer hover:bg-gray-50`,
          onClick: () => {
            toast.dismiss(t.id);
            get().setSelectedNotification(notification);
            if (!notification.isRead) {
               // Try to mark as read when they click the toast.
            }
          }
        },
        React.createElement(
          'div',
          { className: 'flex-1 w-0 p-4' },
          React.createElement(
            'div',
            { className: 'flex items-start' },
            React.createElement(
              'div',
              { className: 'ml-3 flex-1' },
              React.createElement(
                'p',
                { className: 'text-sm font-medium text-gray-900' },
                (notification.severity === 'warning' ? '⚠️ ' : '') + notification.title
              ),
              notification.body && React.createElement(
                'p',
                { className: 'mt-1 text-sm text-gray-500' },
                notification.body
              )
            )
          )
        )
      );
    }, { duration: 5000 });

    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
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

  reset: () => {
    set({ notifications: [], unreadCount: 0, isInitialized: false });
  },
}));

export default useNotificationStore;

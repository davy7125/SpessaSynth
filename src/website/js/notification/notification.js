import { getContent } from './get_content.js'
import { ANIMATION_REFLOW_TIME } from '../utils/animation_utils.js'

const NOTIFICATION_TIME = 13;

let notificationCounter = 0;
/**
 * @type {Object<number, {div: HTMLDivElement, timeout: number}>}
 */
const notifications = {};

/**
 * @typedef {Object} NotificationType
 * @property {HTMLDivElement} div
 * @property {number} id
 */

/**
 * @typedef {Object} NotificationContent
 * @property {"button"|"progress"|"text"|"input"|"toggle"} type
 * @property {string|undefined} textContent
 * @property {string|undefined} translatePathTitle
 * @property {Object<string, string>|undefined} attributes
 * @property {function(NotificationType)|undefined} onClick
 */

/**
 * @param title {string}
 * @param contents {NotificationContent[]}
 * @param time {number} seconds
 * @param allowClosing {boolean}
 * @param locale {LocaleManager}
 * @returns {NotificationType}
 */
export function showNotification(
    title,
    contents,
    time = NOTIFICATION_TIME,
    allowClosing = true,
    locale = undefined)
{
    const notification = document.createElement("div");
    const notificationID = notificationCounter++;

    notification.classList.add("notification");
    notification.innerHTML = `
    <div class='top'>
        <h2 class='notification_title'>${title}</h2>
        <span class='close_btn'>×</span>
    </div>`;
    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add("notification_content");
    notification.appendChild(contentWrapper);
    for(const content of contents)
    {
        const element = getContent(content, locale);
        if(content.onClick)
        {
            element.onclick = () => content.onClick({div: notification, id: notificationID});
        }
        contentWrapper.appendChild(element);
    }

    if(allowClosing)
    {
        notification.getElementsByClassName("close_btn")[0].onclick = () => {
            closeNotification(notificationID);
        };
    }
    else
    {
        notification.getElementsByClassName("close_btn")[0].style.display = "none";
    }

    setTimeout(() => {
        notification.classList.add("drop");
    }, ANIMATION_REFLOW_TIME)
    const timeoutID = setTimeout(() => {
        closeNotification(notificationID);
    }, time * 1000 + ANIMATION_REFLOW_TIME);
    document.getElementsByClassName("spessasynth_main")[0].appendChild(notification);
    notifications[notificationID] = {
        div: notification,
        timeout: timeoutID
    }
    return {
        div: notification,
        id: notificationID
    };
}

/**
 * @param id {number}
 */
export function closeNotification(id)
{
    const notification = notifications[id].div;
    clearTimeout(notifications[id].timeout);
    notification.classList.remove("drop")
    setTimeout(() => notification.parentElement.removeChild(notification), 500);
    notifications[id] = undefined;

}
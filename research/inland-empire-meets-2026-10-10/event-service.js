/**
 * Copyright: Copyright (c) 2016 Company: TeamUnify, LLC
 *
 * @author Bui The Hoa
 * @version 1.0
 */

(function() {
  'use strict';

  angular.module('SOCalendar.views').factory('TeamEventService', TeamEventService);
  TeamEventService.$inject = [
    '$location', '$http', 'HttpClient', 'modal'
  ];

  function TeamEventService($location, $http, HttpClient, modal) {
    (function() {
      console.log("Initializing TeamEventService ...");
    })();

    return {
      acceptTouchPadEvent: acceptTouchPadEvent,
      create: create,
      declineTouchPadEvent: declineTouchPadEvent,
      deleteDocuments: deleteDocuments,
      deletePhotos: deletePhotos,
      deleteTitlePicture: deleteTitlePicture,
      destroy: destroy,
      getConfiguration: getConfiguration,
      getCourseOrders: getCourseOrders,
      getDocuments: getDocuments,
      getEventCats: getEventCats,
      getEventNotes: getEventNotes,
      getMeetById: getMeetById,
      getMeetDescriptionById: getMeetDescriptionById,
      getMeetTypes: getMeetTypes,
      getPhotos: getPhotos,
      getRawData: getRawData,
      getUpcomingMeetById: getUpcomingMeetById,
      openViewModal: openViewModal,
      update: update,
      updateEventNotes: updateEventNotes,
      getMeetDelMsg: getMeetDelMsg,
      undelete: undelete
    };

    function getEventNotes() {
      var req = {
        url : '/rest/teamevent/notes',
        method : "GET"
      }
      return HttpClient.execute(req);
    }

    function updateEventNotes(notes) {
      var url = "/rest/teamevent/notes";

      return $http.post(url, notes);
    }

    function openViewModal(teamEventId, options) {
      if (options === undefined) options = {};

      var path = $location.path();
      if (path.indexOf("/" + teamEventId) < 0) {
        path = path + "/" + teamEventId;
        $location.path(path).replace();
        window.location.href = $location.absUrl();
      }
      var editNow = options.edit || false;
      var viewModal = modal.open({
        templateUrl : editNow ? "/v2/calendar/templates/views/modal/team_event_form.html" : "/v2/calendar/templates/views/modal/team_event.html",
        size : "lg",
        controller: function($scope, $modalInstance) {
          $scope.teamEventId = teamEventId;
          $scope.isEventRegistration = null;
          $scope.viewModalOptions = options;
        },
        windowClass : "CalendarModal" + (editNow ? " EditMode" : ""),
        keyboard: false,
        backdrop: 'static',
      });

      viewModal.result.then(function(e) {
          var path = $location.path();
          if (editNow) {
              if (window.top != window) {
                  window.top.postMessage({action: 'closeIframe', location: $location.absUrl(), result: true});
              }
          }   
          if (path.indexOf(teamEventId) != -1) {
              path = path.replace("/" + teamEventId, "");
              $location.path(path).replace();
              window.location.href = $location.absUrl();
          }
          
      });
    }

    function getRawData(data) {
      var req = {
        url : '/rest/teamevent/rawData',
        method : "POST",
        data: data
      }
      return HttpClient.execute(req);
    }

    function getConfiguration() {
      var req = {
        url : '/rest/teamevent/search/configuration',
        method : "GET"
      }
      return HttpClient.execute(req);
    }

    function deleteTitlePicture(teamEventId) {
      var url = "/rest/ondeck/v2/meet/" + teamEventId + "/removeTitlePic";

      return $http({
        url: url,
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      });
    }

    /*
     * Deletes the specified documents.
     */
    function deleteDocuments(teamEventId, documentIds) {
      var url = "/rest/ondeck/v2/meetfile/" + teamEventId + "/teamEventFile/delete";

      return $http({
        url: url,
        method: 'DELETE',
        data: documentIds,
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      });
    };

    /*
     * Deletes the specified photos.
     */
    function deletePhotos(teamEventId, photoIds) {
      var url = "/rest/ondeck/v2/meetfile/" + teamEventId + "/teamEventPhoto/delete";

      return $http({
        url: url,
        method: 'DELETE',
        data: photoIds,
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      });
    };

    function create(data){
      var req = {
        url : '/rest/ondeck/v2/meet/createTeamEvent',
        method : "POST",
        data: data
      }
      return HttpClient.execute(req);
    }

    function update(teamEvent) {
      var url = "/rest/ondeck/v2/meet/edit/" + teamEvent.id;
      return $http.post(url, teamEvent).then(function(result) {
        return result;
      });
    };

    function getDocuments(teamEventId) {
      var url = "/rest/ondeck/v2/meetfile/" + teamEventId + "/teamEventFile/list";
      return $http.post(url).then(function(response) {
        return response.data;
      });
    }

    function getPhotos(teamEventId) {
      var url = "/rest/ondeck/v2/meetfile/" + teamEventId + "/teamEventPhoto/list";
      return $http.post(url).then(function(response) {
        return response;
      });
    }

    function getMeetDescriptionById(meetId) {
      var url = "/rest/ondeck/v2/meets/description";
      var data = [ meetId ];

      return $http.post(url, data).then(function(result) {
        return result.data[0].description;
      });
    };

    function getUpcomingMeetById(meetId) {
      var url = "/rest/ondeck/v2/meets/upcoming";
      var data = { categoryIds: [] };

      return $http.post(url, data).then(function(result) {
        var meets = result.data;
        for (var i = 0; i < meets.length; i++) {
          if (meets[i].id == meetId) {
            return meets[i];
          }
        }
      });
    };

    function getMeetById(id) {
      var url = "/rest/ondeck/v2/meet/getInstance/" + id;

      return $http.get(url).then(function(result) {
        return result.data;
      });
    }

    function getCourseOrders() {
      var url = "/rest/ondeck/v2/meet/getCourseOrders";

      return $http.get(url).then(function(result) {
        return result.data;
      });
    }

    function getMeetTypes() {
      var url = "/rest/ondeck/v2/meettypes/list";

      return $http.post(url).then(function(result) {
        return result.data;
      });
    }

    function getEventCats() {
      var url = "/rest/ondeck/v2/meet/getEventCats";

      return $http.post(url).then(function(result) {
        return result.data;
      });
    }
    
    function getMeetDelMsg(teamEventId) {
      var url = "/rest/ondeck/v2/meets/delmsg/" + teamEventId;

      return $http.get(url).then(function(result) {
        return result.data;
      });
    }

    function destroy(teamEventId) {
      var url = "/rest/ondeck/v2/meets/delete/" + teamEventId;

      return $http({
        url: url,
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      });
    }

    function undelete(teamEventId) {
      return $http({
        url: '/rest/ondeck/v2/meets/unDelete',
        method: 'POST',
        data: [teamEventId],
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      });
    }

    function declineTouchPadEvent(inviteId) {
      var url = "/rest/ondeck/v2/touchpadMeet/decline/" + inviteId;
      return $http.post(url).then(function(result) {
        return result.data;
      });
    }

    function acceptTouchPadEvent(inviteId) {
      var url = "/rest/ondeck/v2/touchpadMeet/accept/" + inviteId;
      return $http.post(url).then(function(result) {
        return result.data;
      });
    }
  }
})();

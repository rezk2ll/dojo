const KAFKA = 'https://github.com/apache/kafka';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'check-then-act',
	part: 'State and time',
	title: 'Double-checked locking: assign the field last',
	minutes: 10,
	hook: [
		'In the Kafka Java client, a `FetchResponse` holds the records a broker sent back for each partition. `responseData` turns them into a map from partition to data. It builds that map once, on the first call, and keeps it for the next calls.',
		'Several threads can call `responseData` on the same response. The method uses a lock so that only one thread builds the map. A contributor filed [KAFKA-13777](https://issues.apache.org/jira/browse/KAFKA-13777): another thread could still **get the map back before it was full**.'
	],
	terms: [
		{ term: 'Lazy initialization', def: 'Building a value the first time someone asks for it, then reusing it.' },
		{ term: 'Double-checked locking', def: 'Testing a field without the lock, then taking the lock and testing it again before building the value.' },
		{ term: 'volatile', def: 'A Java field modifier: a write to the field is seen right away by every thread that reads it.' }
	],
	bug: {
		title: 'KAFKA-13777: Fix potential FetchResponse#responseData race condition issue (#11963)',
		repo: 'apache/kafka',
		url: `${KAFKA}/blob/1317f3f77a9e1e432e7a81de2dcb88365feeac43/clients/src/main/java/org/apache/kafka/common/requests/FetchResponse.java#L73-L120`,
		fix: `${KAFKA}/commit/366b998a229f26aa4601e6b114c2198de0697562`,
		lang: 'java',
		code: `private final FetchResponseData data;
// we build responseData when needed.
private volatile LinkedHashMap<TopicPartition, FetchResponseData.PartitionData> responseData = null;
…
public LinkedHashMap<TopicPartition, FetchResponseData.PartitionData> responseData(Map<Uuid, String> topicNames, short version) {
    if (responseData == null) {
        synchronized (this) {
            if (responseData == null) {
                responseData = new LinkedHashMap<>();
                data.responses().forEach(topicResponse -> {
                    String name;
                    if (version < 13) {
                        name = topicResponse.topic();
                    } else {
                        name = topicNames.get(topicResponse.topicId());
                    }
                    if (name != null) {
                        topicResponse.partitions().forEach(partition ->
                            responseData.put(new TopicPartition(name, partition.partitionIndex()), partition));
                    }
                });
            }
        }
    }
    return responseData;
}`,
		lines: [9, 19],
		diff: `             synchronized (this) {
                 if (responseData == null) {
-                    responseData = new LinkedHashMap<>();
+                    // Assigning the lazy-initialized responseData in the last step
+                    // to avoid other threads accessing a half-initialized object.
+                    final LinkedHashMap<TopicPartition, FetchResponseData.PartitionData> responseDataTmp =
+                            new LinkedHashMap<>();
                     data.responses().forEach(topicResponse -> {
 …
                             topicResponse.partitions().forEach(partition ->
-                                responseData.put(new TopicPartition(name, partition.partitionIndex()), partition));
+                                responseDataTmp.put(new TopicPartition(name, partition.partitionIndex()), partition));
                         }
                     });
+                    responseData = responseDataTmp;
                 }`,
		notes: [
			'Line 6 tests `responseData == null` without the lock. A non-null field tells the caller that line 9 has run, and nothing about whether the map is full. Line 9 sets the field to an empty map, and the loop on lines 10 to 21 fills it afterwards.',
			'A response holds 3 partitions. Thread A takes the lock, runs line 9 and has put 1 partition at line 19. Thread B calls `responseData`, sees a non-null field at line 6, skips the lock and returns a map with **1 entry instead of 3**. `LinkedHashMap` is also not safe to read while another thread writes to it.',
			'The fix builds the map in a local variable, `responseDataTmp`, and assigns it to the field as the last step. A thread that sees the field set now sees a full map. Line 3 declares the field `volatile`, so the entries written before that assignment are visible to the thread that reads it.',
			'The JIRA ticket quotes the method and proposes a rewrite, with no crash attached. The ticket title is "Assignment of lazy-initialized members should be the last step with double-checked locking". The commit message adds that the old order "would let other threads get the partial object".'
		]
	},
	quiz: [
		{
			q: 'Thread A is inside the lock and has put 1 of 3 partitions. Thread B calls `responseData`. What does B get in the buggy code?',
			options: [
				'It waits for the lock, then gets all 3 partitions',
				'It gets the same map, with 1 partition in it so far',
				'It builds a second map of its own with 3 partitions',
				'It gets null, because the map is not finished'
			],
			answer: 1,
			why: 'The first check runs without the lock. The field is already set, so B never waits and returns the map A is still filling.'
		},
		{
			q: 'Which question does the check outside the lock really answer?',
			options: [
				'Whether another thread holds the lock right now',
				'Whether the field has been assigned yet',
				'Whether every partition is already in the map',
				'Whether the broker has sent the full response'
			],
			answer: 1,
			why: 'A null test only tells you the field was assigned. With the assignment first, assigned and finished are two different moments.'
		},
		{
			q: 'You review a lazy getter that uses double-checked locking. What do you check first?',
			options: [
				'That the lock is on `this` and not on a private object',
				'That the field is assigned only after the value is complete',
				'That the getter is declared `synchronized` as a whole',
				'That the map type keeps insertion order'
			],
			answer: 1,
			why: 'Readers outside the lock trust the field as soon as it is not null. The value must be complete before that, and the field must be `volatile` in Java.'
		}
	],
	recall: {
		q: 'In `responseData`, a thread that skips the lock returns the field as soon as it is not null. Where must the assignment to the field go?',
		a: 'After the loop that puts every partition. The fix fills a local `responseDataTmp` and runs `responseData = responseDataTmp` as the last step.'
	},
	sources: [
		{ title: 'kafka pull request #11963', url: `${KAFKA}/pull/11963` },
		{ title: 'KAFKA-13777 on the Kafka JIRA', url: 'https://issues.apache.org/jira/browse/KAFKA-13777' }
	]
};
